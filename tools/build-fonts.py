#!/usr/bin/env python3
"""Собирает локальные шрифты и подмножество иконок в public/fonts/.

Запуск (нужны python3, fonttools, brotli и пакеты из npm):
    npm i @fontsource-variable/google-sans-flex @fontsource-variable/google-sans-code \
          @fontsource-variable/roboto-flex @fontsource-variable/roboto-mono material-symbols katex
    pip install fonttools brotli
    python3 tools/build-fonts.py ./node_modules

Чтобы добавить новую иконку — допиши её имя в ICONS и запусти скрипт ещё раз.
"""
import shutil, sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

NM = sys.argv[1] if len(sys.argv) > 1 else './node_modules'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'fonts')
os.makedirs(OUT, exist_ok=True)
FS = os.path.join(NM, '@fontsource-variable')

COPY = {
    'google-sans-flex/files/google-sans-flex-latin-wght-normal.woff2': 'google-sans-flex-latin.woff2',
    'google-sans-flex/files/google-sans-flex-latin-rond-normal.woff2': 'google-sans-flex-round-latin.woff2',
    'google-sans-code/files/google-sans-code-latin-wght-normal.woff2': 'google-sans-code-latin.woff2',
    'roboto-flex/files/roboto-flex-latin-wght-normal.woff2': 'roboto-flex-latin.woff2',
    'roboto-flex/files/roboto-flex-cyrillic-wght-normal.woff2': 'roboto-flex-cyrillic.woff2',
    'roboto-mono/files/roboto-mono-cyrillic-wght-normal.woff2': 'roboto-mono-cyrillic.woff2',
}
for src, dst in COPY.items():
    shutil.copy(os.path.join(FS, src), os.path.join(OUT, dst))

# --- Material Symbols Rounded: оставляем только нужные иконки и оси FILL (0..1) и wght (300..600)
ICONS = """
account_balance_wallet add arrow_back arrow_forward arrow_upward attach_file bolt chat_bubble check checklist close
code contrast content_copy dark_mode data_object delete description dock_to_left dock_to_right done_all error
expand_more favorite flash_on folder_zip forum functions image lightbulb light_mode mic payments person refresh
replay search settings speed stars stop stop_circle volume_up auto_awesome
""".split()
f = TTFont(os.path.join(NM, 'material-symbols', 'material-symbols-rounded.woff2'))
f = instancer.instantiateVariableFont(f, {'GRAD': 0, 'opsz': 24, 'wght': (300, 600)})
import io
_b = io.BytesIO(); f.save(_b); _b.seek(0); f = TTFont(_b)  # перезагрузка: иначе subsetter путается в glyf-вариациях
# Оставляем в GSUB только лигатуры нужных иконок, иначе subsetter тянет все ~3500 глyphов
cmap = f.getBestCmap()
wanted = {tuple(cmap[ord(ch)] for ch in name) for name in ICONS}
for lookup in f['GSUB'].table.LookupList.Lookup:
    for st in lookup.SubTable:
        st = getattr(st, 'ExtSubTable', st)
        if getattr(st, 'LookupType', None) is None and not hasattr(st, 'ligatures'):
            continue
        if hasattr(st, 'ligatures'):
            for first in list(st.ligatures):
                st.ligatures[first] = [l for l in st.ligatures[first] if (first,) + tuple(l.Component) in wanted]
                if not st.ligatures[first]:
                    del st.ligatures[first]
opts = subset.Options()
opts.layout_features = ['liga', 'rlig', 'calt', 'ccmp']
opts.flavor = 'woff2'
opts.glyph_names = False
opts.notdef_outline = True
opts.name_IDs = [1, 2]
sub = subset.Subsetter(opts)
sub.populate(text=' ' + ' '.join(ICONS) + ' ' + ''.join(sorted(set(''.join(ICONS)))))
sub.subset(f)
f.flavor = 'woff2'
f.save(os.path.join(OUT, 'material-symbols-rounded.woff2'))

# --- KaTeX: только woff2
KD = os.path.join(NM, 'katex', 'dist')
VD = os.path.join(OUT, '..', 'vendor', 'katex')
os.makedirs(os.path.join(VD, 'fonts'), exist_ok=True)
shutil.copy(os.path.join(KD, 'katex.min.js'), VD)
for n in os.listdir(os.path.join(KD, 'fonts')):
    if n.endswith('.woff2'):
        shutil.copy(os.path.join(KD, 'fonts', n), os.path.join(VD, 'fonts', n))
css = open(os.path.join(KD, 'katex.min.css'), encoding='utf-8').read()
import re
css = re.sub(r',url\([^)]*\.woff\) format\("woff"\)', '', css)
css = re.sub(r',url\([^)]*\.ttf\) format\("truetype"\)', '', css)
open(os.path.join(VD, 'katex.min.css'), 'w', encoding='utf-8').write(css)
print('ok')
