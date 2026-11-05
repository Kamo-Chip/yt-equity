"use client";
import type { AtlasNode } from "@/lib/atlas-layout";
import { BaseEdge, Handle, Position, useInternalNode, type EdgeProps, type NodeProps } from "@xyflow/react";
import { useState } from "react";
function EntityNode({ data, selected }: NodeProps<AtlasNode>) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const n = data.entity;
  const image = n.kind === "firm" ? n.profilePictureUrl : n.profilePictureUrl;
  return (
    <div
      className={`graph-orb ${n.kind} ${selected ? "selected" : ""} ${data.expanded ? "expanded" : ""}`}
      title={n.name}
      data-presence={data.appearance?.phase}
      style={data.appearance ? { transform: `scale(${data.appearance.scale})` } : undefined}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="orb-image">
        {image && failedImage !== image ? (
          <img
            src={image}
            alt=""
            draggable={false}
            style={n.kind === "firm" ? { background: n.profilePictureBackground } : undefined}
            onError={() => setFailedImage(image)}
          />
        ) : (
          <span>{n.name[0]}</span>
        )}
      </div>
      {n.kind === "firm" && <span className="orb-count">{n.channelCount}</span>}
      <strong className="orb-label">{n.name}</strong>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
function FloatingEdge({ source, target, style, selected }: EdgeProps) {
  const a = useInternalNode(source),
    b = useInternalNode(target);
  if (!a || !b) return null;
  const aw = a.measured.width ?? 84,
    ah = a.measured.height ?? 84,
    bw = b.measured.width ?? 52,
    bh = b.measured.height ?? 52;
  const ax = a.internals.positionAbsolute.x + aw / 2,
    ay = a.internals.positionAbsolute.y + ah / 2,
    bx = b.internals.positionAbsolute.x + bw / 2,
    by = b.internals.positionAbsolute.y + bh / 2;
  const distance = Math.hypot(bx - ax, by - ay) || 1,
    dx = (bx - ax) / distance,
    dy = (by - ay) / distance;
  return (
    <BaseEdge
      path={`M ${ax + (dx * aw) / 2} ${ay + (dy * ah) / 2} L ${bx - (dx * bw) / 2} ${by - (dy * bh) / 2}`}
      style={{ ...style, strokeWidth: selected ? 3 : 1.7 }}
      interactionWidth={20}
    />
  );
}

export const edgeTypes = { floating: FloatingEdge };
export const nodeTypes = { entity: EntityNode };
