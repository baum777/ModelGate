import React from "react";
import type { MatrixKnowledgeRoom, MatrixProvenanceSummary } from "./types.js";

type ProvenancePanelProps = {
  provenance: MatrixProvenanceSummary;
  selectedRoom: MatrixKnowledgeRoom;
};

export function ProvenancePanel({ provenance, selectedRoom }: ProvenancePanelProps) {
  return (
    <section className="matrix-mobile-provenance" aria-label="Provenance">
      <div>
        <p>Provenance</p>
        <h3>{provenance.scopeLabel}</h3>
      </div>
      <dl>
        <div>
          <dt>Scope snapshot</dt>
          <dd>{provenance.snapshotId}</dd>
        </div>
        <div>
          <dt>Selected room</dt>
          <dd>{selectedRoom.name}</dd>
        </div>
        <div>
          <dt>Authority</dt>
          <dd>{provenance.authority}</dd>
        </div>
      </dl>
      <ul>
        {provenance.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
