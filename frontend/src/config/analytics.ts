export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-NRN3M9WB";

export const ANALYTICS_ENABLED = process.env.NODE_ENV === "production" && GTM_ID !== "";
