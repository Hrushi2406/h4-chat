import "server-only";

export const billingOperationalErrorResponse = (
  error: unknown,
  fallbackMessage: string,
) => {
  if (error instanceof Error && error.name === "RazorpayConfigurationError") {
    return Response.json(
      {
        error:
          "Billing is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }

  if (error instanceof Error && error.name === "RazorpayRequestError") {
    const timedOut =
      "timedOut" in error && (error as { timedOut?: unknown }).timedOut === true;
    return Response.json(
      {
        error: timedOut
          ? "The payment service timed out. Please try again."
          : "The payment service is temporarily unavailable. Please try again.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  return Response.json({ error: fallbackMessage }, { status: 500 });
};
