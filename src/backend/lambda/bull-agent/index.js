"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
/**
 * Bull Agent Lambda
 * Generates bullish investment thesis using Gemini 3 Thinking API
 * Mandated to find growth catalysts, momentum, and sector leadership
 */
const handler = async (event) => {
    const { ticker, companyName } = event;
    console.log(`[BullAgent] Generating bullish thesis for ${ticker}`);
    // TODO: Implement Gemini 3 API integration:
    // 1. Retrieve Gemini API key from Secrets Manager
    // 2. Construct prompt with stock context, peer data, and news
    // 3. Call Gemini 3 Thinking API with high reasoning mode
    // 4. Parse response into structured thesis points
    // 5. Extract thinking trace for appendix
    // Placeholder response
    return {
        ticker,
        role: 'BULL',
        thesis: [
            {
                point: `${companyName} shows strong technical momentum`,
                evidence: 'Price breakthrough above moving average indicates bullish trend',
                confidence: 0.8,
            },
        ],
        primaryCatalyst: 'Technical Momentum',
        thinkingTrace: '[Placeholder thinking trace]',
        timestamp: new Date().toISOString(),
    };
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUE2QkE7Ozs7R0FJRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7SUFDdkUsTUFBTSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxLQUFLLENBQUM7SUFFdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2Q0FBNkMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUVuRSw0Q0FBNEM7SUFDNUMsa0RBQWtEO0lBQ2xELDhEQUE4RDtJQUM5RCx5REFBeUQ7SUFDekQsa0RBQWtEO0lBQ2xELHlDQUF5QztJQUV6Qyx1QkFBdUI7SUFDdkIsT0FBTztRQUNMLE1BQU07UUFDTixJQUFJLEVBQUUsTUFBTTtRQUNaLE1BQU0sRUFBRTtZQUNOO2dCQUNFLEtBQUssRUFBRSxHQUFHLFdBQVcsa0NBQWtDO2dCQUN2RCxRQUFRLEVBQUUsaUVBQWlFO2dCQUMzRSxVQUFVLEVBQUUsR0FBRzthQUNoQjtTQUNGO1FBQ0QsZUFBZSxFQUFFLG9CQUFvQjtRQUNyQyxhQUFhLEVBQUUsOEJBQThCO1FBQzdDLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtLQUNwQyxDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBM0JXLFFBQUEsT0FBTyxXQTJCbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBIYW5kbGVyIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmludGVyZmFjZSBBZ2VudElucHV0IHtcbiAgdGlja2VyOiBzdHJpbmc7XG4gIGNvbXBhbnlOYW1lOiBzdHJpbmc7XG4gIHRyaWdnZXJUeXBlOiAnNjBNQScgfCAnMjUwTUEnO1xuICBjbG9zZVByaWNlOiBudW1iZXI7XG4gIHBlZXJzOiBzdHJpbmdbXTtcbiAgbmV3c0NvbnRleHQ/OiBzdHJpbmc7XG4gIG1ldHJpY3NDb250ZXh0Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgVGhlc2lzUG9pbnQge1xuICBwb2ludDogc3RyaW5nO1xuICBldmlkZW5jZTogc3RyaW5nO1xuICBzb3VyY2U/OiBzdHJpbmc7XG4gIHNvdXJjZVVybD86IHN0cmluZztcbiAgY29uZmlkZW5jZTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQWdlbnRPdXRwdXQge1xuICB0aWNrZXI6IHN0cmluZztcbiAgcm9sZTogJ0JVTEwnO1xuICB0aGVzaXM6IFRoZXNpc1BvaW50W107XG4gIHByaW1hcnlDYXRhbHlzdDogc3RyaW5nO1xuICB0aGlua2luZ1RyYWNlOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEJ1bGwgQWdlbnQgTGFtYmRhXG4gKiBHZW5lcmF0ZXMgYnVsbGlzaCBpbnZlc3RtZW50IHRoZXNpcyB1c2luZyBHZW1pbmkgMyBUaGlua2luZyBBUElcbiAqIE1hbmRhdGVkIHRvIGZpbmQgZ3Jvd3RoIGNhdGFseXN0cywgbW9tZW50dW0sIGFuZCBzZWN0b3IgbGVhZGVyc2hpcFxuICovXG5leHBvcnQgY29uc3QgaGFuZGxlcjogSGFuZGxlcjxBZ2VudElucHV0LCBBZ2VudE91dHB1dD4gPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgY29uc3QgeyB0aWNrZXIsIGNvbXBhbnlOYW1lIH0gPSBldmVudDtcblxuICBjb25zb2xlLmxvZyhgW0J1bGxBZ2VudF0gR2VuZXJhdGluZyBidWxsaXNoIHRoZXNpcyBmb3IgJHt0aWNrZXJ9YCk7XG5cbiAgLy8gVE9ETzogSW1wbGVtZW50IEdlbWluaSAzIEFQSSBpbnRlZ3JhdGlvbjpcbiAgLy8gMS4gUmV0cmlldmUgR2VtaW5pIEFQSSBrZXkgZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgLy8gMi4gQ29uc3RydWN0IHByb21wdCB3aXRoIHN0b2NrIGNvbnRleHQsIHBlZXIgZGF0YSwgYW5kIG5ld3NcbiAgLy8gMy4gQ2FsbCBHZW1pbmkgMyBUaGlua2luZyBBUEkgd2l0aCBoaWdoIHJlYXNvbmluZyBtb2RlXG4gIC8vIDQuIFBhcnNlIHJlc3BvbnNlIGludG8gc3RydWN0dXJlZCB0aGVzaXMgcG9pbnRzXG4gIC8vIDUuIEV4dHJhY3QgdGhpbmtpbmcgdHJhY2UgZm9yIGFwcGVuZGl4XG5cbiAgLy8gUGxhY2Vob2xkZXIgcmVzcG9uc2VcbiAgcmV0dXJuIHtcbiAgICB0aWNrZXIsXG4gICAgcm9sZTogJ0JVTEwnLFxuICAgIHRoZXNpczogW1xuICAgICAge1xuICAgICAgICBwb2ludDogYCR7Y29tcGFueU5hbWV9IHNob3dzIHN0cm9uZyB0ZWNobmljYWwgbW9tZW50dW1gLFxuICAgICAgICBldmlkZW5jZTogJ1ByaWNlIGJyZWFrdGhyb3VnaCBhYm92ZSBtb3ZpbmcgYXZlcmFnZSBpbmRpY2F0ZXMgYnVsbGlzaCB0cmVuZCcsXG4gICAgICAgIGNvbmZpZGVuY2U6IDAuOCxcbiAgICAgIH0sXG4gICAgXSxcbiAgICBwcmltYXJ5Q2F0YWx5c3Q6ICdUZWNobmljYWwgTW9tZW50dW0nLFxuICAgIHRoaW5raW5nVHJhY2U6ICdbUGxhY2Vob2xkZXIgdGhpbmtpbmcgdHJhY2VdJyxcbiAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgfTtcbn07XG4iXX0=