# Interactive Parallelize Transformer

Explore the site at [ezyang.github.io/interactive-parallelize-transformer](https://ezyang.github.io/interactive-parallelize-transformer/).

The [roofline chapter](roofline.html) adapts Part 1 with independent TPU/NVIDIA GPU
and HBM/network selectors. Its calculations, prose, plots, and exercises follow
the selected boundary. Hardware includes H100, B200, GB200, GB300, and a
preliminary Vera Rubin GPU peak preset, with dated specifications in
`ROOFLINE-SOURCES.md`.

Run `python3 -m http.server 8000` and open `http://localhost:8000/roofline.html`.
Both pages also work as local files. `./build.sh` regenerates the parallelizing
page; `roofline.html` is authored directly. Neither page needs runtime dependencies.

Run the roofline calculation checks with `node --test tests/roofline-model.test.cjs`.
Optional browser checks use Playwright: `node tests/roofline-browser.cjs`.
Set `PLAYWRIGHT_MODULE` to an installed Playwright package path if it is not on
Node's module path, and `CHROME_PATH` to use an existing Chrome executable.
`ROOFLINE_URL` can point to a served page; the default tests the local file.
See [ROOFLINE-SOURCES.md](ROOFLINE-SOURCES.md) for formulas, hardware provenance,
editorial changes, and scope.
