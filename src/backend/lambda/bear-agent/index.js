"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
/**
 * Bear Agent Lambda
 * Generates bearish investment thesis using Gemini 3 Thinking API
 * Mandated to identify valuation traps, structural risks, and peer-relative weakness
 */
const handler = async (event) => {
    const { ticker, companyName } = event;
    console.log(`[BearAgent] Generating bearish thesis for ${ticker}`);
    // TODO: Implement Gemini 3 API integration:
    // 1. Retrieve Gemini API key from Secrets Manager
    // 2. Construct prompt focusing on risks and weaknesses
    // 3. Call Gemini 3 Thinking API with high reasoning mode
    // 4. Parse response into structured thesis points
    // 5. Extract thinking trace for appendix
    // Placeholder response
    return {
        ticker,
        role: 'BEAR',
        thesis: [
            {
                point: `${companyName} may face valuation concerns`,
                evidence: 'Technical breakout may not be supported by fundamentals',
                confidence: 0.7,
            },
        ],
        primaryRisk: 'Valuation Risk',
        thinkingTrace: '[Placeholder thinking trace]',
        timestamp: new Date().toISOString(),
    };
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUE2QkE7Ozs7R0FJRztBQUNJLE1BQU0sT0FBTyxHQUFxQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7SUFDdkUsTUFBTSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxLQUFLLENBQUM7SUFFdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2Q0FBNkMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUVuRSw0Q0FBNEM7SUFDNUMsa0RBQWtEO0lBQ2xELHVEQUF1RDtJQUN2RCx5REFBeUQ7SUFDekQsa0RBQWtEO0lBQ2xELHlDQUF5QztJQUV6Qyx1QkFBdUI7SUFDdkIsT0FBTztRQUNMLE1BQU07UUFDTixJQUFJLEVBQUUsTUFBTTtRQUNaLE1BQU0sRUFBRTtZQUNOO2dCQUNFLEtBQUssRUFBRSxHQUFHLFdBQVcsOEJBQThCO2dCQUNuRCxRQUFRLEVBQUUseURBQXlEO2dCQUNuRSxVQUFVLEVBQUUsR0FBRzthQUNoQjtTQUNGO1FBQ0QsV0FBVyxFQUFFLGdCQUFnQjtRQUM3QixhQUFhLEVBQUUsOEJBQThCO1FBQzdDLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtLQUNwQyxDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBM0JXLFFBQUEsT0FBTyxXQTJCbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBIYW5kbGVyIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmludGVyZmFjZSBBZ2VudElucHV0IHtcbiAgdGlja2VyOiBzdHJpbmc7XG4gIGNvbXBhbnlOYW1lOiBzdHJpbmc7XG4gIHRyaWdnZXJUeXBlOiAnNjBNQScgfCAnMjUwTUEnO1xuICBjbG9zZVByaWNlOiBudW1iZXI7XG4gIHBlZXJzOiBzdHJpbmdbXTtcbiAgbmV3c0NvbnRleHQ/OiBzdHJpbmc7XG4gIG1ldHJpY3NDb250ZXh0Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgVGhlc2lzUG9pbnQge1xuICBwb2ludDogc3RyaW5nO1xuICBldmlkZW5jZTogc3RyaW5nO1xuICBzb3VyY2U/OiBzdHJpbmc7XG4gIHNvdXJjZVVybD86IHN0cmluZztcbiAgY29uZmlkZW5jZTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQWdlbnRPdXRwdXQge1xuICB0aWNrZXI6IHN0cmluZztcbiAgcm9sZTogJ0JFQVInO1xuICB0aGVzaXM6IFRoZXNpc1BvaW50W107XG4gIHByaW1hcnlSaXNrOiBzdHJpbmc7XG4gIHRoaW5raW5nVHJhY2U6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG59XG5cbi8qKlxuICogQmVhciBBZ2VudCBMYW1iZGFcbiAqIEdlbmVyYXRlcyBiZWFyaXNoIGludmVzdG1lbnQgdGhlc2lzIHVzaW5nIEdlbWluaSAzIFRoaW5raW5nIEFQSVxuICogTWFuZGF0ZWQgdG8gaWRlbnRpZnkgdmFsdWF0aW9uIHRyYXBzLCBzdHJ1Y3R1cmFsIHJpc2tzLCBhbmQgcGVlci1yZWxhdGl2ZSB3ZWFrbmVzc1xuICovXG5leHBvcnQgY29uc3QgaGFuZGxlcjogSGFuZGxlcjxBZ2VudElucHV0LCBBZ2VudE91dHB1dD4gPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgY29uc3QgeyB0aWNrZXIsIGNvbXBhbnlOYW1lIH0gPSBldmVudDtcblxuICBjb25zb2xlLmxvZyhgW0JlYXJBZ2VudF0gR2VuZXJhdGluZyBiZWFyaXNoIHRoZXNpcyBmb3IgJHt0aWNrZXJ9YCk7XG5cbiAgLy8gVE9ETzogSW1wbGVtZW50IEdlbWluaSAzIEFQSSBpbnRlZ3JhdGlvbjpcbiAgLy8gMS4gUmV0cmlldmUgR2VtaW5pIEFQSSBrZXkgZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgLy8gMi4gQ29uc3RydWN0IHByb21wdCBmb2N1c2luZyBvbiByaXNrcyBhbmQgd2Vha25lc3Nlc1xuICAvLyAzLiBDYWxsIEdlbWluaSAzIFRoaW5raW5nIEFQSSB3aXRoIGhpZ2ggcmVhc29uaW5nIG1vZGVcbiAgLy8gNC4gUGFyc2UgcmVzcG9uc2UgaW50byBzdHJ1Y3R1cmVkIHRoZXNpcyBwb2ludHNcbiAgLy8gNS4gRXh0cmFjdCB0aGlua2luZyB0cmFjZSBmb3IgYXBwZW5kaXhcblxuICAvLyBQbGFjZWhvbGRlciByZXNwb25zZVxuICByZXR1cm4ge1xuICAgIHRpY2tlcixcbiAgICByb2xlOiAnQkVBUicsXG4gICAgdGhlc2lzOiBbXG4gICAgICB7XG4gICAgICAgIHBvaW50OiBgJHtjb21wYW55TmFtZX0gbWF5IGZhY2UgdmFsdWF0aW9uIGNvbmNlcm5zYCxcbiAgICAgICAgZXZpZGVuY2U6ICdUZWNobmljYWwgYnJlYWtvdXQgbWF5IG5vdCBiZSBzdXBwb3J0ZWQgYnkgZnVuZGFtZW50YWxzJyxcbiAgICAgICAgY29uZmlkZW5jZTogMC43LFxuICAgICAgfSxcbiAgICBdLFxuICAgIHByaW1hcnlSaXNrOiAnVmFsdWF0aW9uIFJpc2snLFxuICAgIHRoaW5raW5nVHJhY2U6ICdbUGxhY2Vob2xkZXIgdGhpbmtpbmcgdHJhY2VdJyxcbiAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgfTtcbn07XG4iXX0=