import React from "react";
import type { MatrixTopic, MatrixTopicPosture } from "./types.js";

type TopicCardProps = {
  topic: MatrixTopic;
};

function postureLabel(posture: MatrixTopicPosture) {
  switch (posture) {
    case "implemented":
      return "Implemented";
    case "deferred":
      return "Deferred";
    case "contract":
    default:
      return "Contract-only";
  }
}

export function TopicCard({ topic }: TopicCardProps) {
  return (
    <article className="matrix-mobile-topic-card">
      <header>
        <div>
          <p>{postureLabel(topic.posture)}</p>
          <h4>{topic.title}</h4>
        </div>
        <span>Updated {topic.updatedAt}</span>
      </header>
      <p>{topic.excerpt}</p>
      <div className="matrix-mobile-signal-row" aria-label="Topic signals">
        {topic.signals.map((signal) => (
          <span key={signal}>{signal}</span>
        ))}
      </div>
    </article>
  );
}
