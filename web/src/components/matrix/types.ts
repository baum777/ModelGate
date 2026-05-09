export type MatrixTopicPosture = "implemented" | "contract" | "deferred";

export type MatrixTopic = {
  id: string;
  title: string;
  excerpt: string;
  posture: MatrixTopicPosture;
  updatedAt: string;
  signals: string[];
};

export type MatrixKnowledgeRoom = {
  id: string;
  name: string;
  alias: string;
  space: string;
  summary: string;
  risk: "low" | "medium" | "high";
  topics: MatrixTopic[];
};

export type MatrixProvenanceSummary = {
  snapshotId: string;
  scopeLabel: string;
  authority: string;
  notes: string[];
};

export type MatrixKnowledgeSurface = {
  homeserverLabel: string;
  scopeName: string;
  rooms: MatrixKnowledgeRoom[];
  provenance: MatrixProvenanceSummary;
};
