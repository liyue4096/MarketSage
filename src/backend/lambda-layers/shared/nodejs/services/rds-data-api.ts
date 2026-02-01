/**
 * RDS Data API Service
 * Replaces pg (TCP connection) with RDS Data API (HTTPS)
 *
 * Benefits:
 * - Lambda doesn't need to be in VPC
 * - No NAT Gateway required ($7.56/week savings)
 * - Automatic connection pooling managed by AWS
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  BatchExecuteStatementCommand,
  Field,
  SqlParameter,
} from '@aws-sdk/client-rds-data';

// Singleton client
let rdsDataClient: RDSDataClient | null = null;

function getClient(): RDSDataClient {
  if (!rdsDataClient) {
    rdsDataClient = new RDSDataClient({
      region: process.env.AWS_REGION || 'us-west-2',
    });
  }
  return rdsDataClient;
}

// Configuration from environment
function getConfig() {
  return {
    resourceArn: process.env.DB_CLUSTER_ARN!,
    secretArn: process.env.DB_SECRET_ARN!,
    database: process.env.DB_NAME || 'marketsage',
  };
}

/**
 * Convert JavaScript value to RDS Data API Field format
 */
function toSqlParameter(value: unknown, index: number): SqlParameter {
  const name = `p${index}`;

  if (value === null || value === undefined) {
    return { name, value: { isNull: true } };
  }

  if (typeof value === 'string') {
    return { name, value: { stringValue: value } };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { name, value: { longValue: value } };
    }
    return { name, value: { doubleValue: value } };
  }

  if (typeof value === 'boolean') {
    return { name, value: { booleanValue: value } };
  }

  if (value instanceof Date) {
    return { name, value: { stringValue: value.toISOString() } };
  }

  if (Array.isArray(value)) {
    // Convert array to PostgreSQL array string format for ANY($n) queries
    return { name, value: { stringValue: `{${value.join(',')}}` } };
  }

  // Default: convert to string
  return { name, value: { stringValue: String(value) } };
}

/**
 * Convert RDS Data API Field to JavaScript value
 */
function fromField(field: Field): unknown {
  if (field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.blobValue !== undefined) return field.blobValue;
  if (field.arrayValue !== undefined) {
    return field.arrayValue.stringValues ||
           field.arrayValue.longValues ||
           field.arrayValue.doubleValues ||
           field.arrayValue.booleanValues || [];
  }
  return null;
}

/**
 * Convert positional parameters ($1, $2, etc.) to named parameters (:p0, :p1, etc.)
 */
function convertPositionalToNamed(sql: string): string {
  let index = 0;
  return sql.replace(/\$(\d+)/g, () => {
    const name = `:p${index}`;
    index++;
    return name;
  });
}

/**
 * Query result interface matching pg library
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/**
 * Execute a SQL query using RDS Data API
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = getClient();
  const config = getConfig();

  // Convert positional params to named params
  const convertedSql = convertPositionalToNamed(sql);

  // Convert params to SqlParameter format
  const sqlParams = params?.map((value, index) => toSqlParameter(value, index));

  const command = new ExecuteStatementCommand({
    resourceArn: config.resourceArn,
    secretArn: config.secretArn,
    database: config.database,
    sql: convertedSql,
    parameters: sqlParams,
    includeResultMetadata: true,
  });

  const response = await client.send(command);

  // Convert response to rows
  const columnNames = response.columnMetadata?.map(col => col.name || '') || [];
  const rows: T[] = (response.records || []).map(record => {
    const row: Record<string, unknown> = {};
    record.forEach((field, index) => {
      const columnName = columnNames[index] || `col${index}`;
      row[columnName] = fromField(field);
    });
    return row as T;
  });

  return {
    rows,
    rowCount: response.numberOfRecordsUpdated ?? rows.length,
  };
}

/**
 * Transaction client for multi-statement transactions
 */
export class TransactionClient {
  private transactionId: string | null = null;
  private config = getConfig();
  private client = getClient();

  async begin(): Promise<void> {
    const command = new BeginTransactionCommand({
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      database: this.config.database,
    });

    const response = await this.client.send(command);
    this.transactionId = response.transactionId!;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    if (!this.transactionId) {
      throw new Error('Transaction not started. Call begin() first.');
    }

    // Convert positional params to named params
    const convertedSql = convertPositionalToNamed(sql);

    // Convert params to SqlParameter format
    const sqlParams = params?.map((value, index) => toSqlParameter(value, index));

    const command = new ExecuteStatementCommand({
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      database: this.config.database,
      sql: convertedSql,
      parameters: sqlParams,
      includeResultMetadata: true,
      transactionId: this.transactionId,
    });

    const response = await this.client.send(command);

    // Convert response to rows
    const columnNames = response.columnMetadata?.map(col => col.name || '') || [];
    const rows: T[] = (response.records || []).map(record => {
      const row: Record<string, unknown> = {};
      record.forEach((field, index) => {
        const columnName = columnNames[index] || `col${index}`;
        row[columnName] = fromField(field);
      });
      return row as T;
    });

    return {
      rows,
      rowCount: response.numberOfRecordsUpdated ?? rows.length,
    };
  }

  async commit(): Promise<void> {
    if (!this.transactionId) {
      throw new Error('Transaction not started. Call begin() first.');
    }

    const command = new CommitTransactionCommand({
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      transactionId: this.transactionId,
    });

    await this.client.send(command);
    this.transactionId = null;
  }

  async rollback(): Promise<void> {
    if (!this.transactionId) {
      return; // Nothing to rollback
    }

    const command = new RollbackTransactionCommand({
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      transactionId: this.transactionId,
    });

    await this.client.send(command);
    this.transactionId = null;
  }

  release(): void {
    // No-op for Data API (connection management is handled by AWS)
    this.transactionId = null;
  }
}

/**
 * Get a transaction client (similar to pool.connect() pattern)
 */
export async function getTransactionClient(): Promise<TransactionClient> {
  return new TransactionClient();
}

/**
 * Pool-like interface for compatibility with existing code
 * This is a drop-in replacement for pg.Pool
 */
export class DataApiPool {
  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return query<T>(sql, params);
  }

  async connect(): Promise<TransactionClient> {
    return getTransactionClient();
  }

  async end(): Promise<void> {
    // No-op for Data API
  }
}

/**
 * Create a new pool (for compatibility with existing code)
 */
export function createPool(): DataApiPool {
  return new DataApiPool();
}

// Default export for compatibility
export default {
  query,
  getTransactionClient,
  createPool,
  DataApiPool,
  TransactionClient,
};
