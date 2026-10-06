#!/usr/bin/env python3
"""Собирает локальные шрифты и подмножество иконок в public/fonts/.

Запуск (нужны python3, fonttools, brotli и пакеты из npm):
    npm i @fontsource-variable/google-sans-flex @fontsource-variable/google-sans-code \
          @fontsource-variable/roboto-flex @fontsource-variable/roboto-mono material-symbols katex
    pip install fonttools brotli
    python3 tools/build-fonts.py ./node_modules

Иконки добавлять не нужно: в шрифте уже весь набор Material Symbols Rounded.
"""
import shutil, sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

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

# --- Material Symbols Rounded: ПОЛНЫЙ набор иконок (все лигатуры), без subset.
# Берём variable-шрифт, фиксируем GRAD=0, opsz=24, wght=400, оставляем ось FILL (0..1) -> ~0.5 МБ woff2.
# Источник: npm-пакет material-symbols (material-symbols-rounded.woff2) ИЛИ файл
# MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf из github.com/google/material-design-icons/variablefont
f = TTFont(os.path.join(NM, 'material-symbols', 'material-symbols-rounded.woff2'))
f = instancer.instantiateVariableFont(f, {'GRAD': 0, 'opsz': 24, 'wght': 400, 'FILL': (0, 1)})
f.flavor = 'woff2'
f.save(os.path.join(OUT, 'material-symbols-rounded-v2.woff2'))  # при пересборке меняй v2 -> v3 и в fonts-v2.css, иначе браузер возьмёт старый файл из кеша

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
