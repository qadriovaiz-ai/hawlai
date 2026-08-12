"use client";

// Shared shape-detection renderer/editor for AI-generated `output` JSON,
// extracted from the Content Marketing department's original Edit+Save
// pattern (src/components/content/ContentMarketingView.tsx) so every
// other department can reuse it instead of re-implementing the same
// slides/days/hooks/ctas/generic-key-value logic. ContentMarketingView
// itself is left untouched (already shipped, not worth the risk of a
// retrofit) — this is for every department wired up after it.
//
// The generic fallback here goes further than the original: it recurses
// into nested arrays-of-objects and nested objects instead of just
// JSON.stringify-ing them, since most other departments' output shapes
// are less flat than Content Marketing's.

function isPlainObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ");
}

export function OutputRenderer({ output }: { output: any }) {
  if (output == null) return null;
  if (typeof output === "string") return <p className="text-sm text-slate-700 whitespace-pre-wrap">{output}</p>;

  if (output.slides) {
    return (
      <div className="space-y-2">
        {output.slides.map((s: any, i: number) => (
          <div key={i} className="bg-slate-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-slate-700">{i + 1}. {s.headline}</p>
            <p className="text-xs text-slate-500">{s.supporting || s.body}</p>
          </div>
        ))}
      </div>
    );
  }
  if (output.days) {
    return (
      <div className="space-y-2">
        {output.days.map((d: any, i: number) => (
          <div key={i} className="bg-slate-200 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-purple-500">{d.day} · {d.contentType}</p>
            <p className="text-sm font-medium text-slate-700">{d.topic}</p>
            <p className="text-xs text-slate-400">{d.angle}</p>
            {d.caption && <p className="text-sm text-slate-600 whitespace-pre-wrap border-t border-slate-200 pt-1.5 mt-1.5">{d.caption}</p>}
          </div>
        ))}
      </div>
    );
  }
  if (output.hooks) return <ul className="space-y-1.5">{output.hooks.map((h: string, i: number) => <li key={i} className="text-sm text-slate-700 bg-slate-200 rounded-lg p-2.5">{h}</li>)}</ul>;
  if (output.ctas) return <ul className="space-y-1.5">{output.ctas.map((c: string, i: number) => <li key={i} className="text-sm text-slate-700 bg-slate-200 rounded-lg p-2.5">{c}</li>)}</ul>;

  return (
    <div className="space-y-3 text-sm text-slate-700">
      {Object.entries(output).map(([key, val]) => (
        <div key={key}>
          {key !== "text" && <p className="text-xs font-semibold text-slate-400 capitalize mb-1">{humanizeKey(key)}</p>}
          <FieldValue value={val} />
        </div>
      ))}
    </div>
  );
}

function FieldValue({ value }: { value: any }) {
  if (value == null) return null;
  if (typeof value === "string") return <p className="whitespace-pre-wrap">{value}</p>;
  if (typeof value !== "object") return <p>{String(value)}</p>;

  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string")) {
      return <ul className="space-y-1">{value.map((v, i) => <li key={i} className="bg-slate-50 rounded-md px-2.5 py-1.5">{v}</li>)}</ul>;
    }
    return (
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="bg-slate-200 rounded-lg p-2.5 space-y-1">
            {isPlainObject(item) ? (
              Object.entries(item).map(([k, v]) => (
                <p key={k}><span className="text-[11px] font-medium text-slate-400 capitalize">{humanizeKey(k)}: </span>{typeof v === "string" ? v : JSON.stringify(v)}</p>
              ))
            ) : (
              <p>{JSON.stringify(item)}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Nested plain object
  return (
    <div className="pl-2.5 border-l-2 border-slate-200 space-y-1">
      {Object.entries(value).map(([k, v]) => (
        <p key={k}><span className="text-[11px] font-medium text-slate-400 capitalize">{humanizeKey(k)}: </span>{typeof v === "string" ? v : JSON.stringify(v)}</p>
      ))}
    </div>
  );
}

export function EditableOutput({ output, onChange }: { output: any; onChange: (next: any) => void }) {
  function setPath(path: (string | number)[], value: any) {
    const next = JSON.parse(JSON.stringify(output));
    let target = next;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
    target[path[path.length - 1]] = value;
    onChange(next);
  }

  if (typeof output === "string") {
    return <textarea value={output} onChange={(e) => onChange(e.target.value)} className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800" rows={4} />;
  }

  if (output.slides) {
    return (
      <div className="space-y-2">
        {output.slides.map((s: any, i: number) => (
          <div key={i} className="bg-slate-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400">{i + 1}.</p>
            <input
              value={s.headline ?? ""}
              onChange={(e) => setPath(["slides", i, "headline"], e.target.value)}
              className="w-full text-sm font-semibold bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-800"
              placeholder="Headline"
            />
            <textarea
              value={s.supporting ?? s.body ?? ""}
              onChange={(e) => setPath(["slides", i, s.supporting !== undefined ? "supporting" : "body"], e.target.value)}
              className="w-full text-xs bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-600"
              rows={2}
            />
          </div>
        ))}
      </div>
    );
  }
  if (output.days) {
    return (
      <div className="space-y-2">
        {output.days.map((d: any, i: number) => (
          <div key={i} className="bg-slate-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-purple-500">{d.day} · {d.contentType}</p>
            <input
              value={d.topic ?? ""}
              onChange={(e) => setPath(["days", i, "topic"], e.target.value)}
              className="w-full text-sm bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-800"
              placeholder="Topic"
            />
            <input
              value={d.angle ?? ""}
              onChange={(e) => setPath(["days", i, "angle"], e.target.value)}
              className="w-full text-xs bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-500"
              placeholder="Angle"
            />
            {d.caption !== undefined && (
              <textarea
                value={d.caption ?? ""}
                onChange={(e) => setPath(["days", i, "caption"], e.target.value)}
                className="w-full text-sm bg-slate-100 border border-purple-200 rounded-md px-2 py-1.5 text-slate-700"
                rows={3}
                placeholder="Ready-to-post caption"
              />
            )}
          </div>
        ))}
      </div>
    );
  }
  if (output.hooks) return <EditableStringList items={output.hooks} onChange={(next) => setPath(["hooks"], next)} />;
  if (output.ctas) return <EditableStringList items={output.ctas} onChange={(next) => setPath(["ctas"], next)} />;

  return (
    <div className="space-y-2.5">
      {Object.entries(output).map(([key, val]) => (
        <div key={key}>
          {key !== "text" && <p className="text-xs font-semibold text-slate-400 capitalize mb-1">{humanizeKey(key)}</p>}
          <EditableFieldValue value={val} onChange={(v) => setPath([key], v)} />
        </div>
      ))}
    </div>
  );
}

function EditableStringList({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((v, i) => (
        <textarea
          key={i}
          value={v}
          onChange={(e) => { const next = [...items]; next[i] = e.target.value; onChange(next); }}
          className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
          rows={1}
        />
      ))}
    </div>
  );
}

function EditableFieldValue({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  if (value == null) return null;
  if (typeof value === "string") {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800" rows={value.length > 80 ? 4 : 2} />;
  }
  if (typeof value !== "object") {
    // Numbers/booleans — rare in generated content, and editing them as
    // free text risks corrupting the type; show read-only instead.
    return <p className="text-sm text-slate-500">{String(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string")) {
      return <EditableStringList items={value} onChange={onChange} />;
    }
    return (
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="bg-slate-200 rounded-lg p-2.5 space-y-1.5">
            {isPlainObject(item) ? (
              Object.entries(item).map(([k, v]) =>
                typeof v === "string" ? (
                  <div key={k}>
                    <p className="text-[11px] font-medium text-slate-400 capitalize mb-0.5">{humanizeKey(k)}</p>
                    <textarea
                      value={v}
                      onChange={(e) => {
                        const next = value.map((x: any, xi: number) => (xi === i ? { ...x, [k]: e.target.value } : x));
                        onChange(next);
                      }}
                      className="w-full text-xs bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
                      rows={v.length > 80 ? 3 : 1}
                    />
                  </div>
                ) : (
                  <p key={k} className="text-xs text-slate-500">{humanizeKey(k)}: {JSON.stringify(v)}</p>
                )
              )
            ) : (
              <p className="text-xs text-slate-500">{JSON.stringify(item)}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Nested plain object
  return (
    <div className="pl-2.5 border-l-2 border-slate-200 space-y-2">
      {Object.entries(value).map(([k, v]) =>
        typeof v === "string" ? (
          <div key={k}>
            <p className="text-[11px] font-medium text-slate-400 capitalize mb-0.5">{humanizeKey(k)}</p>
            <textarea
              value={v}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700"
              rows={v.length > 80 ? 3 : 2}
            />
          </div>
        ) : (
          <p key={k} className="text-xs text-slate-500">{humanizeKey(k)}: {JSON.stringify(v)}</p>
        )
      )}
    </div>
  );
}
