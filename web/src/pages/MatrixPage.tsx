import React, { useEffect, useMemo, useState } from "react";
import { KnowledgeMap } from "../components/matrix/KnowledgeMap.js";
import { ProvenancePanel } from "../components/matrix/ProvenancePanel.js";
import { MatrixSkeleton } from "../components/matrix/Skeletons/MatrixSkeleton.js";
import { TopicCard } from "../components/matrix/TopicCard.js";
import type { MatrixKnowledgeSurface } from "../components/matrix/types.js";

type MatrixPageProps = {
  locale?: "de" | "en";
  initialKnowledge?: MatrixKnowledgeSurface;
};

export function createMockMatrixKnowledge(): MatrixKnowledgeSurface {
  return {
    homeserverLabel: "matrix.mosaic.local",
    scopeName: "Mobile Architecture Scope",
    rooms: [
      {
        id: "!architecture:mosaic.local",
        name: "Architecture Decisions",
        alias: "#architecture:mosaic.local",
        space: "MosaicStacked",
        summary: "Canonical decisions for backend-owned execution, browser review surfaces, and mobile gates.",
        risk: "medium",
        topics: [
          {
            id: "topic-approval-gate",
            title: "Approval-gated execution",
            excerpt: "Matrix write flows remain contract-only until a real Matrix origin is verified end-to-end.",
            posture: "contract",
            updatedAt: "2026-05-09",
            signals: ["backend-owned", "fail-closed", "approval intent"],
          },
          {
            id: "topic-critical-path",
            title: "Critical path discipline",
            excerpt: "Mobile feature surfaces load after tab activation and must not join the chat TTI path.",
            posture: "implemented",
            updatedAt: "2026-05-09",
            signals: ["lazy route", "no preload", "TTI gate"],
          },
          {
            id: "topic-live-e2e",
            title: "Live Matrix E2E",
            excerpt: "Live hierarchy, provenance, and write verification are deferred until credentials stay server-side.",
            posture: "deferred",
            updatedAt: "2026-05-09",
            signals: ["external backend", "no browser secret", "deferred"],
          },
        ],
      },
      {
        id: "!reviews:mosaic.local",
        name: "Review Memory",
        alias: "#reviews:mosaic.local",
        space: "MosaicStacked",
        summary: "Reusable review findings, provenance notes, and implementation handoffs.",
        risk: "low",
        topics: [
          {
            id: "topic-review-reuse",
            title: "Reusable review context",
            excerpt: "Validated findings can be surfaced to Chat as advisory context, never as backend-fresh truth.",
            posture: "implemented",
            updatedAt: "2026-05-08",
            signals: ["advisory", "review surface"],
          },
        ],
      },
      {
        id: "!operations:mosaic.local",
        name: "Operations Log",
        alias: "#ops:mosaic.local",
        space: "MosaicStacked",
        summary: "Runbooks and gate evidence for performance, accessibility, and release posture.",
        risk: "medium",
        topics: [
          {
            id: "topic-gates",
            title: "Performance gate evidence",
            excerpt: "Bundle and Lighthouse evidence is documented before any mobile slice is signed off.",
            posture: "implemented",
            updatedAt: "2026-05-09",
            signals: ["Lighthouse", "bundle budget"],
          },
        ],
      },
    ],
    provenance: {
      snapshotId: "scope-mobile-2026-05-09",
      scopeLabel: "Scope snapshot",
      authority: "Backend-owned Matrix routes",
      notes: [
        "Browser renders read-only knowledge and sends approval intent only.",
        "Backend owns Matrix credentials; no Matrix secret is stored in the browser.",
        "Malformed or partial Matrix state remains fail-closed.",
      ],
    },
  };
}

function loadMockMatrixKnowledge() {
  return new Promise<MatrixKnowledgeSurface>((resolve) => {
    window.setTimeout(() => resolve(createMockMatrixKnowledge()), 160);
  });
}

export function MatrixPage({ locale = "en", initialKnowledge }: MatrixPageProps) {
  const [knowledge, setKnowledge] = useState<MatrixKnowledgeSurface | null>(initialKnowledge ?? null);
  const [selectedRoomId, setSelectedRoomId] = useState(initialKnowledge?.rooms[0]?.id ?? "");

  useEffect(() => {
    if (initialKnowledge) {
      return;
    }

    let cancelled = false;
    void loadMockMatrixKnowledge().then((nextKnowledge) => {
      if (cancelled) {
        return;
      }

      setKnowledge(nextKnowledge);
      setSelectedRoomId(nextKnowledge.rooms[0]?.id ?? "");
    });

    return () => {
      cancelled = true;
    };
  }, [initialKnowledge]);

  const selectedRoom = useMemo(() => (
    knowledge?.rooms.find((room) => room.id === selectedRoomId) ?? knowledge?.rooms[0] ?? null
  ), [knowledge, selectedRoomId]);

  if (!knowledge || !selectedRoom) {
    return <MatrixSkeleton />;
  }

  return (
    <section className="matrix-mobile-page" aria-label="Matrix mobile knowledge surface" data-testid="mobile-matrix-page">
      <div className="matrix-mobile-surface">
        <header className="matrix-mobile-header">
          <div>
            <p>{knowledge.homeserverLabel}</p>
            <h2>{locale === "de" ? "Matrix Wissen" : "Matrix Knowledge"}</h2>
          </div>
          <span className="matrix-mobile-authority">Backend-owned</span>
        </header>

        <div className="matrix-mobile-scope-row">
          <span>{knowledge.scopeName}</span>
          <button type="button" className="matrix-mobile-ask-button">
            {locale === "de" ? "Raum fragen" : "Ask about this room"}
          </button>
        </div>

        <div className="matrix-mobile-layout">
          <KnowledgeMap rooms={knowledge.rooms} selectedRoomId={selectedRoom.id} onSelect={setSelectedRoomId} />
          <section className="matrix-mobile-detail" aria-label={`Knowledge details for ${selectedRoom.name}`}>
            <header className="matrix-mobile-detail-header">
              <div>
                <p>{selectedRoom.space}</p>
                <h3>{selectedRoom.name}</h3>
              </div>
              <span>{selectedRoom.topics.length} topics</span>
            </header>
            <p className="matrix-mobile-room-summary">{selectedRoom.summary}</p>
            <div className="matrix-mobile-topic-stack">
              {selectedRoom.topics.map((topic) => (
                <TopicCard topic={topic} key={topic.id} />
              ))}
            </div>
            <ProvenancePanel provenance={knowledge.provenance} selectedRoom={selectedRoom} />
          </section>
        </div>
      </div>
    </section>
  );
}
