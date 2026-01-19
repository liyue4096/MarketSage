"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
/**
 * API Handler Lambda
 * Handles frontend requests via API Gateway
 * Routes: GET /reports, GET /reports/{ticker}, GET /dates, GET /health
 */
const handler = async (event) => {
    const { httpMethod, path, pathParameters, queryStringParameters } = event;
    console.log(`[ApiHandler] ${httpMethod} ${path}`);
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
    };
    try {
        // Health check
        if (path === '/health') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }),
            };
        }
        // Get available dates
        if (path === '/dates' && httpMethod === 'GET') {
            // TODO: Query Aurora for distinct report dates
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ dates: [] }),
            };
        }
        // Get reports for a date
        if (path === '/reports' && httpMethod === 'GET') {
            const date = queryStringParameters?.date || new Date().toISOString().split('T')[0];
            // TODO: Query Aurora for reports by date
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ date, reports: [] }),
            };
        }
        // Get specific report by ticker
        if (path.startsWith('/reports/') && pathParameters?.ticker && httpMethod === 'GET') {
            const { ticker } = pathParameters;
            const date = queryStringParameters?.date;
            // TODO: Query Aurora for specific report
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ ticker, date, report: null }),
            };
        }
        // Route not found
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Not Found' }),
        };
    }
    catch (error) {
        console.error('[ApiHandler] Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQTs7OztHQUlHO0FBQ0ksTUFBTSxPQUFPLEdBQTJCLEtBQUssRUFBRSxLQUFLLEVBQWtDLEVBQUU7SUFDN0YsTUFBTSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLHFCQUFxQixFQUFFLEdBQUcsS0FBSyxDQUFDO0lBRTFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLFVBQVUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBRWxELE1BQU0sT0FBTyxHQUFHO1FBQ2QsY0FBYyxFQUFFLGtCQUFrQjtRQUNsQyw2QkFBNkIsRUFBRSxHQUFHO1FBQ2xDLDhCQUE4QixFQUFFLHNDQUFzQztLQUN2RSxDQUFDO0lBRUYsSUFBSSxDQUFDO1FBQ0gsZUFBZTtRQUNmLElBQUksSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3ZCLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTztnQkFDUCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQzthQUNqRixDQUFDO1FBQ0osQ0FBQztRQUVELHNCQUFzQjtRQUN0QixJQUFJLElBQUksS0FBSyxRQUFRLElBQUksVUFBVSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzlDLCtDQUErQztZQUMvQyxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU87Z0JBQ1AsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUM7YUFDcEMsQ0FBQztRQUNKLENBQUM7UUFFRCx5QkFBeUI7UUFDekIsSUFBSSxJQUFJLEtBQUssVUFBVSxJQUFJLFVBQVUsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUNoRCxNQUFNLElBQUksR0FBRyxxQkFBcUIsRUFBRSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkYseUNBQXlDO1lBQ3pDLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTztnQkFDUCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUM7YUFDNUMsQ0FBQztRQUNKLENBQUM7UUFFRCxnQ0FBZ0M7UUFDaEMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxJQUFJLGNBQWMsRUFBRSxNQUFNLElBQUksVUFBVSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ25GLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxjQUFjLENBQUM7WUFDbEMsTUFBTSxJQUFJLEdBQUcscUJBQXFCLEVBQUUsSUFBSSxDQUFDO1lBQ3pDLHlDQUF5QztZQUN6QyxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU87Z0JBQ1AsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQzthQUNyRCxDQUFDO1FBQ0osQ0FBQztRQUVELGtCQUFrQjtRQUNsQixPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixPQUFPO1lBQ1AsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUM7U0FDN0MsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QyxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixPQUFPO1lBQ1AsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztTQUN6RCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQXBFVyxRQUFBLE9BQU8sV0FvRWxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5SGFuZGxlciwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbi8qKlxuICogQVBJIEhhbmRsZXIgTGFtYmRhXG4gKiBIYW5kbGVzIGZyb250ZW5kIHJlcXVlc3RzIHZpYSBBUEkgR2F0ZXdheVxuICogUm91dGVzOiBHRVQgL3JlcG9ydHMsIEdFVCAvcmVwb3J0cy97dGlja2VyfSwgR0VUIC9kYXRlcywgR0VUIC9oZWFsdGhcbiAqL1xuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFQSUdhdGV3YXlQcm94eUhhbmRsZXIgPSBhc3luYyAoZXZlbnQpOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zdCB7IGh0dHBNZXRob2QsIHBhdGgsIHBhdGhQYXJhbWV0ZXJzLCBxdWVyeVN0cmluZ1BhcmFtZXRlcnMgfSA9IGV2ZW50O1xuXG4gIGNvbnNvbGUubG9nKGBbQXBpSGFuZGxlcl0gJHtodHRwTWV0aG9kfSAke3BhdGh9YCk7XG5cbiAgY29uc3QgaGVhZGVycyA9IHtcbiAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24sWC1BcGktS2V5JyxcbiAgfTtcblxuICB0cnkge1xuICAgIC8vIEhlYWx0aCBjaGVja1xuICAgIGlmIChwYXRoID09PSAnL2hlYWx0aCcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzdGF0dXM6ICdoZWFsdGh5JywgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEdldCBhdmFpbGFibGUgZGF0ZXNcbiAgICBpZiAocGF0aCA9PT0gJy9kYXRlcycgJiYgaHR0cE1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgIC8vIFRPRE86IFF1ZXJ5IEF1cm9yYSBmb3IgZGlzdGluY3QgcmVwb3J0IGRhdGVzXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIGhlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZGF0ZXM6IFtdIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZXQgcmVwb3J0cyBmb3IgYSBkYXRlXG4gICAgaWYgKHBhdGggPT09ICcvcmVwb3J0cycgJiYgaHR0cE1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgIGNvbnN0IGRhdGUgPSBxdWVyeVN0cmluZ1BhcmFtZXRlcnM/LmRhdGUgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF07XG4gICAgICAvLyBUT0RPOiBRdWVyeSBBdXJvcmEgZm9yIHJlcG9ydHMgYnkgZGF0ZVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGRhdGUsIHJlcG9ydHM6IFtdIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZXQgc3BlY2lmaWMgcmVwb3J0IGJ5IHRpY2tlclxuICAgIGlmIChwYXRoLnN0YXJ0c1dpdGgoJy9yZXBvcnRzLycpICYmIHBhdGhQYXJhbWV0ZXJzPy50aWNrZXIgJiYgaHR0cE1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgIGNvbnN0IHsgdGlja2VyIH0gPSBwYXRoUGFyYW1ldGVycztcbiAgICAgIGNvbnN0IGRhdGUgPSBxdWVyeVN0cmluZ1BhcmFtZXRlcnM/LmRhdGU7XG4gICAgICAvLyBUT0RPOiBRdWVyeSBBdXJvcmEgZm9yIHNwZWNpZmljIHJlcG9ydFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHRpY2tlciwgZGF0ZSwgcmVwb3J0OiBudWxsIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBSb3V0ZSBub3QgZm91bmRcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgaGVhZGVycyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdOb3QgRm91bmQnIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignW0FwaUhhbmRsZXJdIEVycm9yOicsIGVycm9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgaGVhZGVycyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBTZXJ2ZXIgRXJyb3InIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=