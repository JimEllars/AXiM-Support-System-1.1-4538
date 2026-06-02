import re

with open('./src/components/TicketList.jsx', 'r') as f:
    content = f.read()

# Replace className
# From: className="fixed bottom-8 left-1/2 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700 p-4 rounded-2xl shadow-2xl z-50 flex items-center gap-4"
# To: className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700 p-4 rounded-3xl shadow-2xl z-50 flex items-center gap-6"
content = content.replace(
    'className="fixed bottom-8 left-1/2 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700 p-4 rounded-2xl shadow-2xl z-50 flex items-center gap-4"',
    'className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700 p-4 rounded-3xl shadow-2xl z-50 flex items-center gap-6"'
)

# Replace Cases Selected style
# From: <span className="text-zinc-300 font-bold text-sm tracking-widest uppercase px-4 border-r border-zinc-700">
# To: <span className="text-cyan-400 font-bold text-sm tracking-widest uppercase px-4 border-r border-zinc-700">
content = content.replace(
    '<span className="text-zinc-300 font-bold text-sm tracking-widest uppercase px-4 border-r border-zinc-700">',
    '<span className="text-cyan-400 font-bold text-sm tracking-widest uppercase px-4 border-r border-zinc-700">'
)

# Also check Clear button:
# <button
#   onClick={() => useTicketStore.getState().setSelectedTicketIds([])}
#   className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
# >
#   Clear Selection
# </button>
# The prompt says: "Add a [Clear] button that simply clears the array." - Clear Selection button already does that. We can rename it to Clear.
content = content.replace(
    'Clear Selection',
    'Clear'
)

with open('./src/components/TicketList.jsx', 'w') as f:
    f.write(content)
