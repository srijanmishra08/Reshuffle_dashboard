"use client";

import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import type { PipelineModule, PipelineSeedItem } from "@/lib/pipeline-seeds";

const STORAGE_PREFIX = "dashboard_pipeline_items";

function getStorageKey(module: PipelineModule) {
  return `${STORAGE_PREFIX}_${module}`;
}

function loadStoredItems(module: PipelineModule): PipelineSeedItem[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(module));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed as PipelineSeedItem[];
  } catch {
    return null;
  }
}

function saveStoredItems(module: PipelineModule, items: PipelineSeedItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(module), JSON.stringify(items));
  } catch {
    // Ignore storage errors.
  }
}

type PipelineDefinition = {
  module: PipelineModule;
  title: string;
  description: string;
  entityType: string;
  stages: string[];
  defaultStage: string;
  terminalStages: string[];
  allowedTransitions: Record<string, string[]>;
};

type PipelineBoardProps = {
  module: PipelineModule;
  initialItems: PipelineSeedItem[];
  assignees?: string[];
};

export function PipelineBoard({ module, initialItems, assignees }: PipelineBoardProps) {
  const supportsClientContact = module === "crm" || module === "outreach";
  const [items, setItems] = useState(initialItems);
  const [definition, setDefinition] = useState<PipelineDefinition | null>(null);
  const [message, setMessage] = useState<string>("Loading pipeline...");
  const [storageReady, setStorageReady] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newStage, setNewStage] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editStage, setEditStage] = useState("");
  const [editAssignee, setEditAssignee] = useState("");

  useEffect(() => {
    const run = async () => {
      const storedItems = loadStoredItems(module);

      if (storedItems) {
        setItems(storedItems);
      } else {
        setItems(initialItems);
      }

      try {
        const [definitionResponse, itemsResponse] = await Promise.all([
          fetch(`/api/pipelines/${module}`),
          fetch(`/api/pipelines/${module}/items`),
        ]);
        const definitionJson = (await definitionResponse.json()) as {
          data?: PipelineDefinition;
          error?: string;
        };

        if (!definitionResponse.ok || !definitionJson.data) {
          setMessage(definitionJson.error ?? "Could not load pipeline");
          return;
        }

        if (itemsResponse.ok) {
          const itemsJson = (await itemsResponse.json()) as {
            data?: PipelineSeedItem[];
          };

          if (itemsJson.data && !storedItems) {
            setItems(itemsJson.data);
          }
        }

        setDefinition(definitionJson.data);
        setNewStage(definitionJson.data.defaultStage);
        setMessage("Drag a card to move between stages.");
      } catch {
        if (storedItems) {
          setMessage("Working from locally saved data.");
        } else {
          setMessage("Could not load pipeline");
        }
      } finally {
        setStorageReady(true);
      }
    };

    void run();
  }, [initialItems, module]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    saveStoredItems(module, items);
  }, [items, module, storageReady]);

  async function handleDrop(targetStage: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const cardId = event.dataTransfer.getData("text/card-id");
    const fromStage = event.dataTransfer.getData("text/from-stage");

    if (!cardId || !fromStage || !definition) {
      return;
    }

    const card = items.find((item) => item.id === cardId);
    if (!card || fromStage === targetStage) {
      return;
    }

    const nextItems = items.map((item) => (item.id === cardId ? { ...item, stage: targetStage } : item));

    if (!definition.allowedTransitions[fromStage]?.includes(targetStage)) {
      setMessage(`Transition '${fromStage}' -> '${targetStage}' is not allowed.`);
      return;
    }

    try {
      const response = await fetch("/api/pipelines/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          from: fromStage,
          to: targetStage,
          entityType: definition.entityType,
          entityId: card.id,
          metadata: {
            title: card.title,
            subtitle: card.subtitle,
            assignee: card.assignee,
            phone: card.phone,
            email: card.email,
          },
        }),
      });

      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        setItems(nextItems);
        setMessage(json.error ?? `${card.title} moved locally to ${targetStage}.`);
        return;
      }
    } catch {
      setItems(nextItems);
      setMessage(`${card.title} moved locally to ${targetStage}.`);
      return;
    }

    setItems(nextItems);
    setMessage(`${card.title} moved from ${fromStage} to ${targetStage}.`);
  }

  async function handleCreateCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!definition || !newTitle.trim()) {
      return;
    }

    const localItem: PipelineSeedItem = {
      id: `${module}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: newTitle.trim(),
      subtitle: newSubtitle.trim() || undefined,
      stage: newStage || definition.defaultStage,
      assignee: newAssignee || undefined,
      phone: newPhone.trim() || undefined,
      email: newEmail.trim() || undefined,
    };

    try {
      const response = await fetch(`/api/pipelines/${module}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          subtitle: newSubtitle.trim() || undefined,
          stage: newStage || definition.defaultStage,
          assignee: newAssignee || undefined,
          metadata: {
            assignee: newAssignee || undefined,
            phone: newPhone.trim() || undefined,
            email: newEmail.trim() || undefined,
          },
        }),
      });

      const json = (await response.json()) as { error?: string; data?: PipelineSeedItem };

      if (!response.ok || !json.data) {
        setItems((current) => [...current, localItem]);
        setMessage(json.error ?? `Created ${localItem.title} locally.`);
      } else {
        setItems((current) => [...current, json.data as PipelineSeedItem]);
        setMessage(`Created ${json.data.title}.`);
      }
    } catch {
      setItems((current) => [...current, localItem]);
      setMessage(`Created ${localItem.title} locally.`);
    }

    setNewTitle("");
    setNewSubtitle("");
    setNewPhone("");
    setNewEmail("");
    setNewStage(definition.defaultStage);
    setNewAssignee("");
  }

  function startEdit(item: PipelineSeedItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditSubtitle(item.subtitle ?? "");
    setEditPhone(item.phone ?? "");
    setEditEmail(item.email ?? "");
    setEditStage(item.stage);
    setEditAssignee(item.assignee ?? "");
  }

  async function saveEdit(itemId: string) {
    if (!editTitle.trim()) {
      setMessage("Title cannot be empty");
      return;
    }

    const localItem: PipelineSeedItem = {
      id: itemId,
      title: editTitle.trim(),
      subtitle: editSubtitle.trim() || undefined,
      stage: editStage,
      assignee: editAssignee || undefined,
      phone: editPhone.trim() || undefined,
      email: editEmail.trim() || undefined,
    };

    try {
      const response = await fetch(`/api/pipelines/${module}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          subtitle: editSubtitle.trim() || undefined,
          stage: editStage,
          assignee: editAssignee || undefined,
          metadata: {
            assignee: editAssignee || undefined,
            phone: editPhone.trim() || undefined,
            email: editEmail.trim() || undefined,
          },
        }),
      });

      const json = (await response.json()) as { error?: string; data?: PipelineSeedItem };

      if (!response.ok || !json.data) {
        setItems((current) => current.map((item) => (item.id === itemId ? localItem : item)));
        setEditingId(null);
        setMessage(json.error ?? `Updated ${localItem.title} locally.`);
        return;
      }

      setItems((current) => current.map((item) => (item.id === itemId ? (json.data as PipelineSeedItem) : item)));
      setEditingId(null);
      setMessage(`Updated ${json.data.title}.`);
      return;
    } catch {
      setItems((current) => current.map((item) => (item.id === itemId ? localItem : item)));
      setEditingId(null);
      setMessage(`Updated ${localItem.title} locally.`);
      return;
    }
  }

  async function deleteCard(itemId: string) {
    try {
      const response = await fetch(`/api/pipelines/${module}/items/${itemId}`, {
        method: "DELETE",
      });

      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        setItems((current) => current.filter((item) => item.id !== itemId));
        if (editingId === itemId) {
          setEditingId(null);
        }
        setMessage(json.error ?? "Card deleted locally.");
        return;
      }
    } catch {
      setItems((current) => current.filter((item) => item.id !== itemId));
      if (editingId === itemId) {
        setEditingId(null);
      }
      setMessage("Card deleted locally.");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== itemId));
    if (editingId === itemId) {
      setEditingId(null);
    }
    setMessage("Card deleted.");
  }

  if (!definition) {
    return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{message}</section>;
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{definition.title}</h3>
        <p className="text-sm text-slate-600">{definition.description}</p>
        <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{message}</p>
      </div>

      <form onSubmit={handleCreateCard} className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 md:grid-cols-7">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Card title"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 md:col-span-2"
          />
          <input
            value={newSubtitle}
            onChange={(event) => setNewSubtitle(event.target.value)}
            placeholder="Subtitle (optional)"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 md:col-span-2"
          />
          {supportsClientContact && (
            <>
              <input
                value={newPhone}
                onChange={(event) => setNewPhone(event.target.value)}
                placeholder="Phone"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              />
              <input
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="Email"
                type="email"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </>
          )}
          <div className="flex gap-2">
            <select
              value={newStage}
              onChange={(event) => setNewStage(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
            >
              {definition.stages.map((stage) => (
                <option key={`new-${stage}`} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Add
            </button>
          </div>
        </div>
        {assignees && assignees.length > 0 && (
          <select
            value={newAssignee}
            onChange={(event) => setNewAssignee(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 md:w-72"
          >
            <option value="">— No assignee —</option>
            {assignees.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </form>

      <div className="grid gap-3 pb-2 md:grid-cols-2 xl:grid-cols-3">
        {definition.stages.map((stage) => (
          <div
            key={stage}
            onDrop={(event) => void handleDrop(stage, event)}
            onDragOver={(event) => event.preventDefault()}
            className="min-h-64 min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">{stage}</h4>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                {items.filter((item) => item.stage === stage).length}
              </span>
            </div>

            <div className="space-y-2">
              {items
                .filter((item) => item.stage === stage)
                .map((item) => (
                  <article
                    key={item.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/card-id", item.id);
                      event.dataTransfer.setData("text/from-stage", item.stage);
                    }}
                    className="cursor-grab rounded-lg border border-slate-200 bg-white p-2 active:cursor-grabbing"
                  >
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <input
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                        <input
                          value={editSubtitle}
                          onChange={(event) => setEditSubtitle(event.target.value)}
                          placeholder="Subtitle"
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        {supportsClientContact && (
                          <>
                            <input
                              value={editPhone}
                              onChange={(event) => setEditPhone(event.target.value)}
                              placeholder="Phone"
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                            />
                            <input
                              value={editEmail}
                              onChange={(event) => setEditEmail(event.target.value)}
                              placeholder="Email"
                              type="email"
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                            />
                          </>
                        )}
                        {assignees && assignees.length > 0 && (
                          <select
                            value={editAssignee}
                            onChange={(event) => setEditAssignee(event.target.value)}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">— No assignee —</option>
                            {assignees.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        )}
                        <select
                          value={editStage}
                          onChange={(event) => setEditStage(event.target.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          {definition.stages.map((entryStage) => (
                            <option key={`edit-${item.id}-${entryStage}`} value={entryStage}>
                              {entryStage}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit(item.id)}
                            className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-800">{item.title}</p>
                        {item.subtitle ? <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p> : null}
                        {supportsClientContact && item.phone ? (
                          <p className="mt-1 text-xs text-slate-500">Phone: {item.phone}</p>
                        ) : null}
                        {supportsClientContact && item.email ? (
                          <p className="mt-1 text-xs text-slate-500">Email: {item.email}</p>
                        ) : null}
                        {item.assignee ? (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                            <span>👤</span> {item.assignee}
                          </p>
                        ) : null}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteCard(item.id)}
                            className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
