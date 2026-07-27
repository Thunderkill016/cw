import { digestCanonicalJson } from "./integrity.js";


export interface AiProvenance {
  model: string;
  promptDigest: string;
  promptSummary?: string;
  provider: string;
  sessionId: string;
  generatedAt: string;
  reasoningTraceDigest?: string;
}

export interface ProvenanceRecord {
  schemaVersion: 1;
  recordType: "ai-provenance";
  taskId: string;
  contractDigest: string;
  aiProvenance: AiProvenance;
  provenanceDigest: string;
}

export interface CreateProvenanceRecordInput {
  taskId: string;
  contractDigest: string;
  aiProvenance: Omit<AiProvenance, "generatedAt"> & { generatedAt?: string };
}

export function createProvenanceRecord(
  params: CreateProvenanceRecordInput
): ProvenanceRecord {
  const recordWithoutDigest = {
    schemaVersion: 1 as const,
    recordType: "ai-provenance" as const,
    taskId: params.taskId,
    contractDigest: params.contractDigest,
    aiProvenance: {
      ...params.aiProvenance,
      generatedAt: params.aiProvenance.generatedAt || new Date().toISOString(),
    },
  };

  const provenanceDigest = digestCanonicalJson(
    "cw-provenance-record",
    recordWithoutDigest
  );

  return {
    ...recordWithoutDigest,
    provenanceDigest,
  };
}

export function verifyProvenanceRecord(record: ProvenanceRecord): boolean {
  const { provenanceDigest, ...recordWithoutDigest } = record;
  const computedDigest = digestCanonicalJson(
    "cw-provenance-record",
    recordWithoutDigest
  );
  return computedDigest === provenanceDigest;
}

export function formatProvenanceForSlsa(record: ProvenanceRecord) {
  // To be used inside formatSlsaProvenance or as a standalone function
  // We'll update slsa.ts to integrate this.
  return {
    builder: {
      id: `agent://${record.aiProvenance.provider}/${record.aiProvenance.model}`,
    },
    metadata: {
      startedOn: record.aiProvenance.generatedAt,
    },
    byproducts: [
      {
        name: "promptDigest",
        digest: {
          sha256: record.aiProvenance.promptDigest,
        },
      },
      ...(record.aiProvenance.reasoningTraceDigest
        ? [
            {
              name: "reasoningTraceDigest",
              digest: {
                sha256: record.aiProvenance.reasoningTraceDigest,
              },
            },
          ]
        : []),
    ],
  };
}
