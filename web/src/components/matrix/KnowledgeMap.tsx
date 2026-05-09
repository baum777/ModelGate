import React from "react";
import type { MatrixKnowledgeRoom } from "./types.js";

type KnowledgeMapProps = {
  rooms: MatrixKnowledgeRoom[];
  selectedRoomId: string;
  onSelect: (roomId: string) => void;
};

function riskLabel(risk: MatrixKnowledgeRoom["risk"]) {
  switch (risk) {
    case "high":
      return "High signal";
    case "medium":
      return "Medium signal";
    case "low":
    default:
      return "Low signal";
  }
}

export function KnowledgeMap({ rooms, selectedRoomId, onSelect }: KnowledgeMapProps) {
  return (
    <section className="matrix-mobile-map" aria-label="Knowledge rooms">
      <div className="matrix-mobile-section-header">
        <h3>Rooms</h3>
        <span>{rooms.length}</span>
      </div>
      <div className="matrix-mobile-room-list" role="list">
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            className={room.id === selectedRoomId ? "matrix-mobile-room matrix-mobile-room-active" : "matrix-mobile-room"}
            onClick={() => onSelect(room.id)}
            aria-pressed={room.id === selectedRoomId}
          >
            <span className={`matrix-mobile-room-risk matrix-mobile-risk-${room.risk}`} aria-label={riskLabel(room.risk)} />
            <span className="matrix-mobile-room-main">
              <strong>{room.name}</strong>
              <span>{room.alias}</span>
            </span>
            <span className="matrix-mobile-topic-count">{room.topics.length} topics</span>
          </button>
        ))}
      </div>
    </section>
  );
}
