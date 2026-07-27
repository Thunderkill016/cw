export type HealthStatus = {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  timestamp: string;
};

const START_TIME = Date.now();

export function getSystemHealth(): HealthStatus {
  return {
    status: "ok",
    version: "0.1.0",
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
  };
}
