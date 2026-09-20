// Optional browser regression check. Requires Playwright and a Chromium browser;
// the website itself has no runtime dependencies. See README.md.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ROOFLINE_URL || pathToFileURL(path.resolve(__dirname, '../roofline.html')).href;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error' && e.text().includes('Roofline readout')) errors.push(e.text()); });
    async function open(values = {}, hash = '') {
      const url = new URL(base); url.search = new URLSearchParams(values); url.hash = hash;
      await page.goto(url.href);
    }
    async function edit(locator, value) {
      await locator.scrollIntoViewIfNeeded();
      await locator.press('Enter'); await locator.fill(String(value)); await locator.press('Enter');
    }
    const local = key => page.locator(`#plot [data-var="${key}"]`);
    const global = key => page.locator(`.machine [data-var="${key}"]`);
    const intensity = async () => Number((await page.locator('#plot [data-value="intensity"]').innerText()).replaceAll(',', ''));

    // Unchanged time windows follow the reading; explicit choices survive switches and links.
    const timeWindow = page.locator('[data-select="timeWindow"]');
    await open();
    assert.equal(await timeWindow.inputValue(), '0.001');
    await page.locator('[data-choice-value="gpu"]').click();
    assert.equal(await timeWindow.inputValue(), '0.00001');
    assert.equal(await page.locator('#timeline').getAttribute('data-window'), '0.00001');
    assert.equal(new URL(page.url()).searchParams.has('timeWindow'), false);
    await page.locator('[data-choice-value="network"]').click();
    assert.equal(await timeWindow.inputValue(), '0.00001');
    await page.locator('[data-choice-value="hbm"]').click();
    assert.equal(await timeWindow.inputValue(), '0.00001');
    await timeWindow.selectOption('0.001');
    assert.equal(new URL(page.url()).searchParams.get('timeWindow'), '0.001');
    await page.reload();
    assert.equal(await timeWindow.inputValue(), '0.001', 'Reload lost an explicit 1 ms GPU HBM window');
    await page.locator('[data-choice-value="network"]').click();
    await page.locator('[data-choice-value="hbm"]').click();
    assert.equal(await timeWindow.inputValue(), '0.001');
    await page.locator('#reset').click();
    assert.equal(await timeWindow.inputValue(), '0.00001');
    assert.equal(new URL(page.url()).searchParams.has('timeWindow'), false);
    assert.equal(await page.locator('#reset').evaluate(e => e.classList.contains('dirty')), false);
    await page.goBack();
    assert.equal(await timeWindow.inputValue(), '0.001');
    await page.goForward();
    assert.equal(await timeWindow.inputValue(), '0.00001');
    await timeWindow.selectOption('auto');
    await page.locator('[data-choice-value="tpu"]').click();
    assert.equal(await timeWindow.inputValue(), 'auto');
    await open({ family: 'gpu', boundary: 'hbm' });
    assert.equal(await timeWindow.inputValue(), '0.00001', 'Direct GPU HBM load missed the default');

    for (const family of ['tpu', 'gpu']) {
      await open({ family, boundary: 'network' });
      assert.equal(await timeWindow.inputValue(), '0.00001', 'Network default must be 10 µs');
      await timeWindow.selectOption('0.001');
      await page.reload();
      assert.equal(await timeWindow.inputValue(), '0.001', 'Explicit network window lost on reload');
    }
    const fs = require('node:fs');
    const source = fs.readFileSync(path.resolve(__dirname, '../source/roofline.md'), 'utf8');
    const originalSummary = JSON.parse(source.split('\n').find(line => line.startsWith('description: ')).slice('description: '.length));
    assert.equal(await page.locator('header .dek').innerText(), originalSummary);
    assert.equal(await page.locator('.howto, p.try').count(), 0, 'Interaction tutorial remains');
    assert.match(await page.locator('#workload .adaptation-label').innerText(), /✦ adaptation/);
    assert.match(await page.locator('#hardware-specs h3').first().innerText(), /✦ adaptation/);

    // Each time scale remembers its own explicit window, including through links/history.
    await open({ family: 'gpu', boundary: 'network' });
    const chooseScale = scale => page.locator(`[data-choice="timeScale"][data-choice-value="${scale}"]`).click();
    await timeWindow.selectOption('0.001');
    await chooseScale('log');
    assert.equal(await timeWindow.inputValue(), '1');
    await timeWindow.selectOption('0.1');
    await chooseScale('linear');
    assert.equal(await timeWindow.inputValue(), '0.001');
    await page.reload();
    await chooseScale('log');
    assert.equal(await timeWindow.inputValue(), '0.1');
    await page.goBack();
    assert.equal(await timeWindow.inputValue(), '0.001');
    await page.goForward();
    assert.equal(await timeWindow.inputValue(), '0.1');
    await page.locator('#reset').click();
    assert.equal(await timeWindow.inputValue(), '0.00001');
    await chooseScale('log');
    assert.equal(await timeWindow.inputValue(), '1');
    await open({ family: 'tpu', boundary: 'network', timeScale: 'log' });
    assert.equal(await timeWindow.inputValue(), '1');
    await chooseScale('linear');
    assert.equal(await timeWindow.inputValue(), '0.00001');

    // Pin a network comparison, move past it, and restore the floating 2× roof.
    await open({ family: 'gpu', boundary: 'network', D: 128 });
    const bw2 = page.locator('#roofline-figure [data-value="comparisonBandwidth"]');
    await page.locator('#pin-bw2').click();
    const pinnedBW = await bw2.innerText();
    assert.equal(await page.locator('#roofline-figure [data-value="comparisonMode"]').innerText(), 'pinned');
    await edit(global('bandwidthScale'), 10);
    assert.equal(await bw2.innerText(), pinnedBW);
    const pointY = async n => Number(await page.locator(`[data-bandwidth-point="${n}"]`).getAttribute('cy'));
    assert.ok(await pointY(1) < await pointY(2), 'Pinned comparison failed when BW₁ became faster');
    assert.match(await page.locator('.region-legend [data-value="mixedRegime"]').innerText(), /^Compute-bound at BW₁/);
    await page.locator('#hardware').selectOption('rubin');
    assert.equal(await bw2.innerText(), pinnedBW);
    await page.reload();
    assert.equal(await bw2.innerText(), pinnedBW, 'Pinned rate lost on reload');
    await page.locator('#restore-bw2').click();
    assert.equal(await page.locator('#restore-bw2').isDisabled(), true);
    assert.equal(new URL(page.url()).searchParams.has('networkBW2'), false);
    assert.ok(await pointY(2) <= await pointY(1));
    for (const key of ['computeScale', 'bandwidthScale']) {
      await edit(global(key), 1);
      const box = await global(key).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      assert.equal(Number(await global(key).getAttribute('aria-valuenow')), 10, `${key} drag was not logarithmic`);
      await global(key).press('End');
      assert.equal(await global(key).getAttribute('aria-valuenow'), '100');
      await global(key).press('Home');
      assert.equal(await global(key).getAttribute('aria-valuenow'), '0.01');
      await global(key).press('ArrowRight');
      assert.ok(Number(await global(key).getAttribute('aria-valuenow')) > 0.01);
    }
    await page.locator('#pin-bw2').click();
    await page.locator('#reset').click();
    assert.equal(await page.locator('#restore-bw2').isDisabled(), true);

    for (const family of ['tpu', 'gpu']) for (const boundary of ['hbm', 'network']) {
      await open({ family, boundary });
      await page.locator('details').evaluateAll(es => es.forEach(e => { e.open = true; }));
      const text = await page.locator('body').innerText();
      const inlineKeys = await page.locator('main [data-var]:visible').evaluateAll(es => [...new Set(es.map(e => e.dataset.var))].sort());
      const toolbarKeys = await page.locator('.machine [data-var]:visible').evaluateAll(es => es.map(e => e.dataset.var).sort());
      assert.deepEqual(toolbarKeys, inlineKeys, 'A shared parameter is missing from the top bar');
      // Definitions must be in the reader's path before the first figure.
      for (const definition of ['Batch size:', 'Input width:', 'Output width:', 'Call the input matrix X', 'Let C be', 'Let W be']) {
        assert.ok(text.includes(definition), `Missing definition: ${definition}`);
        assert.ok(text.indexOf(definition) < text.indexOf('Computation and communication times'), `Late definition: ${definition}`);
      }
      assert.ok(text.indexOf('Definition: the arithmetic intensity') < text.indexOf('Visualizing rooflines', text.indexOf('Definition: the arithmetic intensity')));
      if (boundary === 'network') assert.ok(text.indexOf('Let s be') < text.indexOf('Q = sBF'));
      const equationLinks = page.locator('.equation-number:visible');
      assert.deepEqual(await equationLinks.allTextContents(), Array.from({ length: await equationLinks.count() }, (_, i) => `(${i + 1})`));
      assert.equal(await page.locator('#footnote-list > li').count(), boundary === 'hbm' ? 3 : 2);
      assert.equal(await page.locator('#roofline-plot [data-regime]').count(), 3);
      const comparison = await page.locator('#roofline-plot [data-bandwidth-point]').evaluateAll(es => es.map(e => ({ x: Number(e.getAttribute('cx')), y: Number(e.getAttribute('cy')) })));
      assert.equal(comparison[0].x, comparison[1].x, 'The bandwidth comparison changed algorithm intensity');
      assert.ok(comparison[0].y <= comparison[1].y, 'More bandwidth reduced the plotted throughput');

      const before = await intensity();
      const parameters = await page.locator('#plot [data-value="weightElements"]').innerText();
      await edit(local('B'), '256');
      const shared = await page.locator('[data-var="B"]').evaluateAll(es => es.map(e => e.getAttribute('aria-valuenow')));
      assert.ok(shared.length >= 4 && shared.every(v => v === '256'), 'Batch controls fell out of sync');
      if (boundary === 'network') assert.equal(await intensity(), before);
      else assert.ok(await intensity() > before);
      assert.equal(await page.locator('#plot [data-value="weightElements"]').innerText(), parameters, 'Batch size changed the parameter count');

      const priorD = await intensity();
      await edit(local('D'), '8192');
      assert.ok(await intensity() > priorD, 'Changing D beside the plot did not update it');
      await edit(local('F'), '8192');
      assert.ok((await page.locator('[data-var="F"]').evaluateAll(es => es.map(e => e.getAttribute('aria-valuenow')))).every(v => v === '8192'));
      assert.notEqual(await page.locator('#plot [data-value="weightElements"]').innerText(), parameters);
      assert.equal(await page.locator('#time .parameter-count [data-value="weightElements"]').innerText(), await page.locator('#plot [data-value="weightElements"]').innerText());
      assert.match(await page.locator('#time .cost-formula:visible').first().innerText(), boundary === 'hbm' ? /2BDF/ : /BDF/);

      // Use the actual pointer interaction at the plot, then keyboard editing.
      await local('B').scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        window.scrubNodes = ['#timeline [data-segment="compute"]', '#timeline text[y="160"]', '#roofline-plot polyline', '#roofline-plot [data-bandwidth-point="1"]', '#shape-plot polyline', '#hardware option:checked'].map(selector => document.querySelector(selector));
        window.scrubRemoved = 0;
        window.scrubObserver = new MutationObserver(records => { for (const record of records) window.scrubRemoved += record.removedNodes.length; });
        for (const selector of ['#timeline', '#roofline-plot', '#shape-plot', '#hardware']) window.scrubObserver.observe(document.querySelector(selector), { childList: true, subtree: true });
      });
      const b = await local('B').boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2, { steps: 4 });
      await page.waitForFunction(() => Number(document.querySelector('#plot [data-var="B"]').getAttribute('aria-valuenow')) > 256);
      assert.equal(await page.evaluate(() => window.scrubNodes.every(node => node && node.isConnected)), true, 'Dragging replaced chart elements or hardware options');
      await page.mouse.up();
      assert.equal(await page.evaluate(() => { window.scrubObserver.disconnect(); return window.scrubRemoved; }), 0, 'Dragging rebuilt unchanged charts or controls');
      assert.ok(Number(await local('B').getAttribute('aria-valuenow')) > 256);
      const dragged = Number(await local('B').getAttribute('aria-valuenow'));
      await local('B').press('ArrowRight');
      assert.equal(Number(await local('B').getAttribute('aria-valuenow')), dragged + 1);

      for (const precision of (family === 'gpu' ? ['bf16', 'fp8'] : ['bf16', 'int8', 'weights8'])) {
        await page.locator('#matmul [data-select="precision"]').selectOption(precision);
        assert.equal(await page.locator('.machine [data-select="precision"]').inputValue(), precision, 'Inline precision did not update the toolbar');
        assert.ok(!/no finite value|Unavailable|NaN/.test(await page.locator('body').innerText()));
        assert.match(await page.locator('#time .figure-context').innerText(), precision === 'fp8' ? /FP8 inputs and weights, BF16 output/ : precision === 'bf16' ? /BF16/ : /INT8/);
      }
      await page.locator('.machine [data-select="precision"]').selectOption('bf16');
      assert.equal(await page.locator('#matmul [data-select="precision"]').inputValue(), 'bf16', 'Toolbar precision did not update the inline control');
    }

    // The sticky controls work while reading, and share state with inline controls.
    await open({}, 'roofline-figure');
    await page.locator('#roofline-plot').scrollIntoViewIfNeeded();
    const initialTimes = await page.locator('#time .readout-grid strong').allTextContents();
    for (const [key, typed, value] of [['B', 512, 512], ['D', 8192, 8192], ['F', 16384, 16384], ['computeScale', 0.75, 0.75], ['bandwidthScale', 1.5, 1.5], ['overlap', 50, 0.5], ['vectorN', 131072, 131072]]) {
      const chartY = (await page.locator('#roofline-plot').boundingBox()).y;
      await edit(global(key), typed);
      const values = await page.locator(`[data-var="${key}"]`).evaluateAll(es => es.map(e => Number(e.getAttribute('aria-valuenow'))));
      assert.ok(values.length > 1 && values.every(v => v === value), `Top-bar ${key} did not synchronize`);
      assert.ok(Math.abs((await page.locator('#roofline-plot').boundingBox()).y - chartY) < 2, `Editing ${key} moved the reading position`);
    }
    assert.notDeepEqual(await page.locator('#time .readout-grid strong').allTextContents(), initialTimes, 'Top-bar settings did not update the timeline');
    const beforePrecision = await intensity();
    await page.locator('.machine [data-select="precision"]').selectOption('weights8');
    assert.ok(await intensity() > beforePrecision, 'Top-bar precision did not update the roofline');
    await page.locator('#share').click();
    await page.reload();
    assert.equal(await global('B').getAttribute('aria-valuenow'), '512');
    assert.equal(await global('overlap').getAttribute('aria-valuenow'), '0.5');
    assert.equal(await page.locator('.machine [data-select="precision"]').inputValue(), 'weights8');
    await page.locator('#reset').click();
    assert.equal(await global('B').getAttribute('aria-valuenow'), '128');
    assert.equal(await global('vectorN').getAttribute('aria-valuenow'), '65536');
    assert.equal(await page.locator('.machine [data-select="precision"]').inputValue(), 'bf16');

    await open({ family: 'gpu', gpu: 'rubin', precision: 'fp8' }, 'matmul');
    assert.equal(await page.locator('#matmul [data-select="precision"]').inputValue(), 'fp8');
    assert.equal(await page.locator('[data-value="specFP8"]').innerText(), '17.5 PFLOP/s');
    assert.match(await page.locator('#matmul .takeaway:visible').innerText(), /FP8.*562 tokens/);
    assert.deepEqual(await page.locator('#matmul [data-value="qW"], #matmul [data-value="qA"], #matmul [data-value="qO"]').allTextContents(), ['1', '1', '2']);
    assert.match(await page.locator('#time .cost-formula:visible').nth(1).innerText(), /oBF/);
    await page.reload();
    assert.equal(await page.locator('.machine [data-select="precision"]').inputValue(), 'fp8');
    await page.locator('[data-choice-value="network"]').click();
    assert.equal(await page.locator('[data-select="wire"]').inputValue(), '2');
    assert.match(await page.locator('#time .figure-context').innerText(), /FP8.*2 bytes/);
    await page.locator('[data-choice-value="tpu"]').click();
    assert.deepEqual(await page.locator('[data-select="precision"]').evaluateAll(es => es.map(e => e.value)), ['bf16', 'bf16']);
    assert.ok((await page.locator('option[value="fp8"]').evaluateAll(es => es.map(e => e.disabled && e.hidden))).every(Boolean));
    assert.match(await page.locator('[role="status"]').innerText(), /Switched to BF16/);

    await open({ family: 'gpu', gpu: 'rubin' });
    const rubinTitle = page.locator('#plot .figure-heading');
    assert.match(await rubinTitle.innerText(), /Rubin \(preliminary\)/);
    assert.ok(!(await rubinTitle.innerText()).includes('NVL72'));
    assert.equal(await page.locator('#hardware').inputValue(), 'rubin');
    const rubinRow = page.locator('[data-hardware="rubin"]');
    assert.match(await rubinRow.innerText(), /4 PFLOP\/s/);
    assert.match(await rubinRow.innerText(), /22 TB\/s/);
    await page.locator('[data-choice-value="network"]').click();
    assert.match(await rubinTitle.innerText(), /Vera Rubin NVL72 \(preliminary\)/);
    assert.match(await rubinRow.innerText(), /1.8 TB\/s/);
    await page.locator('[data-select="fabric"]').selectOption('scaleout');
    assert.match(await rubinRow.innerText(), /200 GB\/s/);
    assert.deepEqual(await page.locator('.machine [data-select="precision"] option:enabled').evaluateAll(es => es.map(e => e.value)), ['bf16', 'fp8']);
    await page.reload();
    assert.equal(await page.locator('#hardware').inputValue(), 'rubin', 'Shared URL lost Rubin');
    assert.equal(await page.locator('[data-select="fabric"]').inputValue(), 'scaleout');
    await page.locator('#hardware').selectOption('gb300');
    assert.deepEqual(await page.locator('[data-select="wire"] option:enabled').evaluateAll(es => es.map(e => e.value)), ['2', '4']);

    // A fixed time scale makes batch reuse visible in the HBM segments.
    await open({ timeWindow: 0.0001 });
    const timeline = page.locator('#timeline');
    const ticks = () => timeline.locator('text[y="160"]').allTextContents();
    const widths = () => timeline.locator('[data-segment]').evaluateAll(es => Object.fromEntries(es.map(e => [e.dataset.segment, Number(e.getAttribute('width'))])));
    const initialTicks = await ticks(), initialWidths = await widths();
    await edit(page.locator('#time figure [data-var="B"]'), '256');
    const doubledWidths = await widths();
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
    near(doubledWidths.parameters, initialWidths.parameters);
    near(doubledWidths.activations, initialWidths.activations * 2);
    near(doubledWidths.compute, initialWidths.compute * 2);
    assert.deepEqual(await ticks(), initialTicks, 'Batch size rescaled the time axis');
    const segmentColors = () => timeline.locator('[data-segment]').evaluateAll(es => Object.fromEntries(es.map(e => [e.dataset.segment, e.getAttribute('fill')])));
    const initialColors = await segmentColors();
    assert.notEqual(initialColors.parameters, initialColors.activations);
    for (const percent of [50, 0, 100]) {
      await edit(page.locator('#time [data-var="overlap"]'), percent);
      assert.deepEqual(await segmentColors(), initialColors, 'Overlap recolored the traffic categories');
      const current = await widths();
      for (const key of Object.keys(doubledWidths)) near(current[key], doubledWidths[key]);
      assert.deepEqual(await ticks(), initialTicks, 'Overlap rescaled the time axis');
    }
    await page.locator('[data-choice-value="gpu"]').click();
    assert.deepEqual(await ticks(), initialTicks, 'Hardware rescaled the time axis');
    for (const [key, max] of [['B', 65536], ['D', 32768], ['F', 131072]]) {
      await edit(page.locator(`#time figure [data-var="${key}"]`), 1048576);
      assert.equal(await local(key).getAttribute('aria-valuenow'), String(max));
    }
    assert.deepEqual(await ticks(), initialTicks, 'Large dimensions rescaled the time axis');
    assert.match(await page.locator('.timeline-overflow').innerText(), /Full elapsed time:/);
    assert.match(await timeline.textContent(), /finish beyond window/);
    assert.ok(await timeline.locator('path').count() > 0, 'Missing continuation arrows');
    assert.ok(await timeline.evaluate(svg => {
      const edge = Number(svg.querySelector('line[y1="138"]').getAttribute('x2'));
      return [...svg.querySelectorAll('rect')].every(e => Number(e.getAttribute('x')) + Number(e.getAttribute('width')) <= edge + 1e-8);
    }), 'An overflowing bar escaped the time window');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1440);
    await page.locator('[data-select="timeWindow"]').selectOption('1');
    assert.notDeepEqual(await ticks(), initialTicks, 'Manual time window did not change the axis');
    assert.equal(await page.locator('.timeline-overflow').innerText(), '');
    await open({ boundary: 'network', timeWindow: 0.001 });
    assert.deepEqual(Object.keys(await segmentColors()).sort(), ['compute', 'network']);
    assert.equal(await page.locator('[aria-label="HBM traffic components"]').isVisible(), false);

    // Auto follows the operation; log changes geometry, never the calculation.
    await open({ family: 'gpu', gpu: 'rubin', timeWindow: 'auto' });
    const autoSpan = Number(await timeline.getAttribute('data-window'));
    await edit(page.locator('#time figure [data-var="B"]'), '8192');
    assert.ok(Number(await timeline.getAttribute('data-window')) > autoSpan, 'Auto did not follow a larger operation');
    assert.equal(await page.locator('.timeline-overflow').innerText(), '');
    assert.equal(await timeline.locator('path').count(), 0, 'Auto clipped an operation');
    const linearWidths = await widths();
    const times = await page.locator('#time .readout-grid strong').allTextContents();
    await page.locator('[data-choice="timeScale"][data-choice-value="log"]').click();
    await timeWindow.selectOption('auto');
    assert.equal(await timeline.getAttribute('data-scale'), 'log');
    assert.notDeepEqual(await widths(), linearWidths, 'Log did not change the geometry');
    assert.deepEqual(await page.locator('#time .readout-grid strong').allTextContents(), times, 'Log changed the modeled times');
    assert.equal((await ticks())[0], '0 s', 'Log lost the shared zero');
    assert.match(await page.locator('[data-value="timelineScaleNote"]').innerText(), /no longer proportional/);
    async function checkLogIntervals() {
      assert.ok(await timeline.evaluate(svg => {
        const axis = svg.querySelector('line[y1="138"]');
        const left = Number(axis.getAttribute('x1')), right = Number(axis.getAttribute('x2'));
        const bars = [...svg.querySelectorAll('[data-segment]')];
        if (!bars.length) return false;
        for (const bar of bars) {
          const x = Number(bar.getAttribute('x')), width = Number(bar.getAttribute('width'));
          if (!Number.isFinite(x + width) || width <= 0 || x < left || x + width > right + 1e-8) return false;
          if (Number(bar.dataset.start) === 0 && Math.abs(x - left) > 1e-8) return false;
        }
        const parameters = svg.querySelector('[data-segment="parameters"]');
        const activations = svg.querySelector('[data-segment="activations"]');
        if (parameters && activations && Math.abs(Number(parameters.getAttribute('x')) + Number(parameters.getAttribute('width')) - Number(activations.getAttribute('x'))) > 1e-8) return false;
        return true;
      }), 'Log intervals escaped the window, lost zero, or broke the HBM stack');
    }
    for (const boundary of ['hbm', 'network']) {
      await page.locator(`[data-choice="boundary"][data-choice-value="${boundary}"]`).click();
      for (const percent of [0, 50, 100]) {
        await edit(page.locator('#time [data-var="overlap"]'), percent);
        await checkLogIntervals();
        assert.equal(await timeline.locator('path').count(), 0);
      }
    }
    await page.reload();
    assert.equal(await page.locator('[data-select="timeWindow"]').inputValue(), 'auto');
    assert.equal(await page.locator('[data-choice-value="log"]').getAttribute('aria-pressed'), 'true');
    await page.setViewportSize({ width: 320, height: 900 });
    await checkLogIntervals();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'Log controls overflowed mobile');
    await page.locator('[data-select="timeWindow"]').selectOption('0.00001');
    assert.match(await page.locator('.timeline-overflow').innerText(), /Full elapsed time:/);
    await checkLogIntervals();
    await page.locator('[data-choice-value="linear"]').click();
    assert.equal(await timeline.getAttribute('data-scale'), 'linear');
    assert.equal(await timeWindow.inputValue(), 'auto', 'Linear scale lost its saved Auto window');
    await page.locator('[data-choice-value="log"]').click();
    assert.equal(Number(await timeline.getAttribute('data-window')), 0.00001, 'Log scale lost its fixed window');
    await page.setViewportSize({ width: 1440, height: 1000 });

    await open();
    const overlap = page.locator('#time [data-var="overlap"]');
    for (const typed of ['50', '50%']) {
      await edit(overlap, typed);
      assert.equal(await overlap.getAttribute('aria-valuenow'), '0.5');
      assert.equal(await overlap.innerText(), '50%');
    }
    await edit(overlap, ''); assert.equal(await overlap.innerText(), '100%');
    await edit(local('D'), '4097'); assert.equal(await local('D').getAttribute('aria-valuenow'), '4097');
    await page.locator('[data-choice-value="network"]').click();
    assert.equal(await local('D').getAttribute('aria-valuenow'), '4098');
    await edit(local('B'), 'not a number');
    assert.equal(await local('B').getAttribute('aria-valuenow'), '128');
    assert.match(await page.locator('[role="status"]').innerText(), /previous value was kept/);

    await page.locator('[data-choice-value="hbm"]').click();
    await page.locator('#problems .exercise').first().locator('summary').first().click();
    await page.locator('[data-example="int8"]').click();
    assert.equal(new URL(page.url()).hash, '#roofline-figure');
    assert.match(await page.locator('#plot .figure-context').innerText(), /INT8/);
    assert.match(await page.locator('[role="status"]').innerText(), /Example loaded/);
    await page.locator('#share').click();
    await page.waitForFunction(() => /copied|address bar/.test(document.querySelector('[role="status"]').textContent));
    assert.match(await page.locator('[role="status"]').innerText(), /copied|address bar/);
    const status = await page.locator('[role="status"]').boundingBox();
    assert.ok(status.y >= 0 && status.y + status.height <= 1000, 'Feedback disappeared below the viewport');

    await open();
    const footnote = page.locator('[data-note="precision"]');
    await footnote.click();
    await page.waitForFunction(() => !document.querySelector('#note-precision').hidden);
    assert.equal(await footnote.getAttribute('aria-expanded'), 'true');
    await footnote.press('Escape');
    assert.equal(await page.locator('#note-precision').isVisible(), false);
    assert.equal(await footnote.evaluate(e => document.activeElement === e), true);
    await footnote.press('Enter');
    assert.equal(await page.locator('#note-precision').isVisible(), true);
    await page.locator('.machine [data-select="precision"]').click();
    assert.equal(await page.locator('#note-precision').isVisible(), false);
    const equation = page.locator('.equation-number:visible').first();
    const equationTarget = await equation.getAttribute('href');
    await equation.click();
    assert.equal(new URL(page.url()).hash, equationTarget);
    assert.ok((await page.locator(equationTarget).boundingBox()).y >= (await page.locator('.machine').boundingBox()).height);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await open({ family: 'gpu', boundary: 'network', B: 1048576, D: 1048576, F: 1048576 }, 'roofline-figure');
      await page.locator('#roofline-plot').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const top = await global('B').boundingBox(), bar = await page.locator('.machine').boundingBox();
      assert.equal(bar.y, 0, 'Mobile toolbar did not stay at the top');
      assert.ok(top.y >= 0 && top.y + top.height <= bar.height, 'Mobile batch control is hidden');
      await edit(global('B'), 256);
      assert.equal(await local('B').getAttribute('aria-valuenow'), '256');
      await page.locator('#matmul [data-select="precision"]').selectOption('fp8');
      assert.equal(await page.locator('.machine [data-select="precision"]').inputValue(), 'fp8');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'Inline precision overflowed mobile');
      await footnote.click();
      const note = await page.locator('#note-precision').boundingBox();
      assert.ok(note && note.x >= 0 && note.x + note.width <= width && note.y >= 0 && note.y + note.height <= 844, 'Footnote is outside the mobile viewport');
      await footnote.press('Escape');
      assert.equal(await page.locator('#note-precision').isVisible(), false);
    }
    await page.setViewportSize({ width: 320, height: 480 });
    await open({ family: 'gpu', boundary: 'network' }, 'roofline-figure');
    const toolbar = page.locator('.machine');
    assert.ok((await toolbar.boundingBox()).height <= 240, 'The toolbar takes more than half a short screen');
    await page.locator('.machine [data-select="wire"]').selectOption('4');
    await page.locator('.machine [data-select="fabric"]').selectOption('scaleout');
    assert.equal(await page.locator('main [data-value="wire"]').first().innerText(), '4');
    await edit(global('B'), 1024);
    assert.equal(await local('B').getAttribute('aria-valuenow'), '1024');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    assert.equal(await toolbar.evaluate(e => e.scrollWidth <= e.clientWidth), true, 'Toolbar controls overflow horizontally');
    assert.deepEqual(errors, []);
    // Exercises retain their original hardware and rates, with no network variants.
    for (const values of [{}, {tpu: 'v5p'}, {tpu: 'v6e'}, {boundary: 'network'},
      {family: 'gpu', gpu: 'h100'}, {family: 'gpu', gpu: 'gb200'},
      {family: 'gpu', gpu: 'h100', boundary: 'network'}, {computeScale: 0.8}, {bandwidthScale: 2}]) {
      await open(values);
      const expected = values.family === 'gpu' && values.gpu === 'h100' && !values.boundary ? ['Question 4']
        : Object.keys(values).length === 0 ? ['Question 1', 'Question 2', 'Question 3'] : [];
      const headings = await page.locator('#problems .question-heading:visible').allTextContents();
      assert.deepEqual(headings.map(t => t.slice(0, 10)), expected);
      assert.equal(await page.locator('nav.toc a[href="#problems"]').isVisible(), expected.length > 0);
      assert.equal(await page.locator('#problems').isVisible(), expected.length > 0);
    }
    await open({tpu: 'v6e', D: 1024, F: 1024});
    assert.match(await page.locator('[data-value="hbmTakeaway"]').innerText(), /HBM-bound at every batch size/);
    await open({family: 'gpu', gpu: 'h100', boundary: 'network', precision: 'fp8'});
    assert.equal(await page.locator('[data-value="inputType"]').innerText(), 'fp8');
    assert.equal(await page.locator('[data-value="weightType"]').innerText(), 'fp8');
    await open({family: 'gpu', precision: 'int8', wire: 1});
    assert.equal(await page.locator('.machine [data-select="precision"]').inputValue(), 'bf16');
    await page.locator('[data-choice-value="network"]').click();
    assert.equal(await page.locator('[data-select="wire"]').inputValue(), '2');

    console.log('PASS: notation order, sticky global controls, plot-local B/D/F, shared state, drag/keyboard controls, precision labels, fixed and automatic timeline windows, linear/log scales, bounded dimensions, HBM traffic segments, overflow, roofline regions and bandwidth comparison, equation numbering/links, accessible footnotes, percentage entry, odd dimensions, errors, exercise navigation, feedback, and mobile controls.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
