# Writing a chapter

The handbook is built from `src/chapters/`, one HTML fragment per chapter, by
`build.py`. `render-pdf.sh` typesets the PDF in two passes so the contents
page carries real page numbers, and `render-epub.sh` rasterizes `cover.svg`
and packs the Kindle edition. `make-book.sh` runs all three.

## Rules

- **Write from the code.** Every function, type, table, route and number in a
  chapter must exist in the repo. Where the code and the handbook disagree,
  the code is right and the handbook has a bug.
- **No em dashes.** The build warns on them. Use a comma, a period, a colon or
  parentheses.
- **No secrets, no personal data.** Refer to environment variables by name.
- **Plain, direct prose.** Short sentences. The reader is a competent engineer
  who has never seen this repo.
- **Well-formed XML.** Every tag closed, void elements self-closed, `&` `<`
  `>` escaped, attributes quoted, one root `<section>`. The same fragment is
  packed into the EPUB, and a chapter that does not parse stops the build.

## Skeleton

```html
<section class="chapter" id="ch07" data-hue="kundli">
<p class="chapter-kicker">Chapter 7</p>
<h2><span class="num">7</span><span>Kundli</span></h2>
<p class="lede">One paragraph on what this part is for.</p>
<h3 id="s7-1"><span class="num">7.1</span><span>Intent</span></h3>
<p>...</p>
<h3 id="s7-9"><span class="num">7.9</span><span>Study notes</span></h3>
<div class="study">
<h4>Read in this order</h4><ol><li><code>lib/astrology/chart.ts</code></li></ol>
<h4>Check yourself</h4>
<p class="q">A question.</p><p class="a">Its answer.</p>
</div>
</section>
```

The section id is the file stem. Every `h3` has an id `s<chapter>-<n>`. Any
other id (SVG markers, anchors) starts with the stem, because ids are global
across the book. Link to a chapter with `<a href="#ch03">` and to a section
with `<a href="#s3-2">`. The contents page is generated from the `h2` and
`h3` headings, so a new heading needs no other edit.

## Building blocks

`<pre class="tree">` for file trees, `<div class="tablewrap"><table>` for
tables (`class="num-cell"` on numeric cells), `<div class="note">` with a
leading `<b>` label (add `caution`, `blocked` or `good`), `<div class="rail"
data-hue="...">` for a themed sidebar, `<span class="tag">` for a small label,
and the study block above. Hues: `system`, `chart`, `readings`, `auth`,
`intake`, `chat`, `kundli`, `timeline`, `alerts`, `device`, `profile`, `web`,
`data`, `ios`, `ship`, `safety`, `ref`.

Diagrams are inline SVG in a `<figure>` with `class="diagram"`, a `viewBox`
no wider than 860, and only these classes, which the stylesheet and the EPUB
packer both know: `box`, `box-alt`, `box-hot`, `lbl`, `lbl-sm`, `lbl-hot`,
`flow`, `flow-hot`, `flow-dash`, `wall`, `head`, `head-hot`. No `style`
attributes and no external images.

## Shapes

Foundations and under-the-hood chapters take one idea per numbered section.
Feature chapters follow the same order every time: Intent; Files and
folders; Model; The server side; The clients; How it works; Performance and
cost; Edge cases and tests; Study notes.

## Check before you build

```sh
python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" src/chapters/ch07.html
grep -c '—' src/chapters/ch07.html      # must be 0
python3 build.py                        # warns on em dashes and unresolved links
```
