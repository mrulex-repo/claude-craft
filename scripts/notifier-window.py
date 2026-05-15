#!/usr/bin/env python3
"""
Toast-style notification window: bottom-right corner, stays until dismissed.
argv[1] = agentName, argv[2] = lockFilePath
"""
import sys
import os

try:
    import tkinter as tk
except ImportError:
    sys.exit(1)

agent_name = sys.argv[1] if len(sys.argv) > 1 else 'unknown'
lock_file  = sys.argv[2] if len(sys.argv) > 2 else None

def cleanup():
    if lock_file:
        try:
            os.remove(lock_file)
        except OSError:
            pass

root = tk.Tk()
root.overrideredirect(True)   # borderless
root.attributes('-topmost', True)

# macOS: use the floating window layer so it appears above full-screen apps
if sys.platform == 'darwin':
    try:
        root.tk.call('::tk::unsupported::MacWindowStyle', 'style', root._w, 'help', 'none')
    except Exception:
        pass

# Colors — dark terminal aesthetic
BG     = '#1c1c1e'
FG     = '#f2f2f7'
MUTED  = '#8e8e93'
ACCENT = '#0a84ff'
BTN_BG = '#2c2c2e'

root.configure(bg=BG)

# 1-px border via outer frame
border = tk.Frame(root, bg='#3a3a3c', padx=1, pady=1)
border.pack(fill=tk.BOTH, expand=True)

wrap = tk.Frame(border, bg=BG, padx=14, pady=11)
wrap.pack(fill=tk.BOTH, expand=True)

# ── Header row ──────────────────────────────────────────────
hdr = tk.Frame(wrap, bg=BG)
hdr.pack(fill=tk.X)

tk.Label(
    hdr, text='● Claude Code', fg=ACCENT, bg=BG,
    font=('', 11, 'bold'),
).pack(side=tk.LEFT)

def dismiss(e=None):
    cleanup()
    root.destroy()

close_lbl = tk.Label(hdr, text='✕', fg=MUTED, bg=BG, cursor='hand2', font=('', 10))
close_lbl.pack(side=tk.RIGHT)
close_lbl.bind('<Button-1>', dismiss)
close_lbl.bind('<Enter>', lambda e: close_lbl.configure(fg=FG))
close_lbl.bind('<Leave>', lambda e: close_lbl.configure(fg=MUTED))

# ── Message ─────────────────────────────────────────────────
tk.Label(
    wrap,
    text=f'Agent "{agent_name}" has finished.',
    fg=MUTED, bg=BG, font=('', 10),
    wraplength=240, justify=tk.LEFT,
).pack(anchor='w', pady=(7, 11))

# ── Dismiss button ───────────────────────────────────────────
tk.Button(
    wrap, text='Dismiss', command=dismiss,
    bg=BTN_BG, fg=FG, relief='flat',
    padx=10, pady=4, cursor='hand2',
    activebackground='#3a3a3c', activeforeground=FG,
    borderwidth=0, highlightthickness=0,
).pack(anchor='e')

# ── Drag support ─────────────────────────────────────────────
def drag_start(e):
    root._dx = e.x_root - root.winfo_x()
    root._dy = e.y_root - root.winfo_y()

def drag_move(e):
    root.geometry(f'+{e.x_root - root._dx}+{e.y_root - root._dy}')

for widget in (border, wrap, hdr):
    widget.bind('<ButtonPress-1>', drag_start)
    widget.bind('<B1-Motion>',     drag_move)

root.bind('<Escape>', dismiss)

# ── Position bottom-right ────────────────────────────────────
root.update_idletasks()
sw = root.winfo_screenwidth()
sh = root.winfo_screenheight()
ww = root.winfo_reqwidth()
wh = root.winfo_reqheight()
margin  = 20
menubar = 30   # rough menu bar / top panel height
root.geometry(f'+{sw - ww - margin}+{menubar + margin}')

root.deiconify()
root.mainloop()
cleanup()
