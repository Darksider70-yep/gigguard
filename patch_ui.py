import os

with open("gigguard-frontend/lib/types.ts", "r") as f:
    content = f.read()

old_flags = "    graph_flags: string[];"
new_flags = "    graph_flags: any;"
content = content.replace(old_flags, new_flags)

with open("gigguard-frontend/lib/types.ts", "w") as f:
    f.write(content)

with open("gigguard-frontend/app/insurer/flagged/page.tsx", "r") as f:
    content = f.read()

old_ul = """                <ul className="mt-3 list-disc pl-6 text-sm text-secondary">
                  {alert.graph_flags.map((flag) => (
                    <li key={`${alert.claim_id}_${flag}`}>{flag}</li>
                  ))}
                </ul>"""

new_ul = """                {alert.graph_flags && Array.isArray(alert.graph_flags) && (
                  <ul className="mt-3 list-disc pl-6 text-sm text-secondary">
                    {alert.graph_flags.map((flag: string) => (
                      <li key={`${alert.claim_id}_${flag}`}>{flag}</li>
                    ))}
                  </ul>
                )}
                {alert.graph_flags && !Array.isArray(alert.graph_flags) && (
                  <div className="mt-3 rounded border border-indigo-500/30 bg-indigo-500/10 p-3">
                    <p className="text-xs font-semibold text-indigo-300 mb-2">GNN Fraud Intelligence</p>
                    <div className="flex items-center gap-2 mb-2">
                       <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">GraphSAGE</span>
                       <span className="text-xs text-secondary">Part of estimated {alert.graph_flags.ring_size_estimate}-person ring</span>
                    </div>
                    <div className="flex gap-2 flex-wrap mb-2">
                      {alert.graph_flags.contributing_edges?.map((e: string) => (
                        <span key={e} className="px-1.5 py-0.5 rounded text-[10px] border border-amber-500/30 text-amber-200 bg-amber-500/10">{e}</span>
                      ))}
                    </div>
                    <p className="text-[10px] text-secondary">Flagged neighbors: {alert.graph_flags.flagged_neighbors?.join(', ')}</p>
                  </div>
                )}"""

if old_ul in content:
    content = content.replace(old_ul, new_ul)
else:
    print("WARNING: ul not found")

with open("gigguard-frontend/app/insurer/flagged/page.tsx", "w") as f:
    f.write(content)

print("Patched ui")
