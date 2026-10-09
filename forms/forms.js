// Shared logic for the parent forms: signature pad, validation,
// submission and the printable copy shown after submitting.
(function () {
  'use strict';

  const COACH_PHONE = '0746 451 222';

  // ---------- Signature pad ----------
  // Draws in the canvas's own pixel space. The canvas is sized when it is
  // first touched (it may be hidden when the page loads) and only re-sized
  // when its on-screen width really changes, keeping what was drawn.
  function SignaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    const INK = '#13213a';
    let drawing = false;
    let empty = true;
    let last = null;

    function fit() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return false;
      const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
      const w = Math.round(rect.width * ratio);
      const h = Math.round(rect.height * ratio);
      if (canvas.width === w && canvas.height === h) return true;
      let copy = null;
      if (!empty && canvas.width && canvas.height) {
        copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext('2d').drawImage(canvas, 0, 0);
      }
      canvas.width = w;
      canvas.height = h;
      if (copy) ctx.drawImage(copy, 0, 0, w, h);
      return true;
    }
    function pos(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) * (canvas.width / r.width),
        y: (clientY - r.top) * (canvas.height / r.height),
      };
    }
    function start(clientX, clientY) {
      if (!fit()) return;
      drawing = true;
      last = pos(clientX, clientY);
      const lw = Math.max(2, canvas.width / 260);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(last.x, last.y, lw / 2, 0, Math.PI * 2);
      ctx.fill();
      if (empty) {
        empty = false;
        canvas.dispatchEvent(new Event('signed'));
      }
    }
    function move(clientX, clientY) {
      if (!drawing) return;
      const p = pos(clientX, clientY);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, canvas.width / 260);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }
    function end() { drawing = false; }

    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        start(e.clientX, e.clientY);
      });
      canvas.addEventListener('pointermove', (e) => { if (drawing) { e.preventDefault(); move(e.clientX, e.clientY); } });
      ['pointerup', 'pointercancel'].forEach((t) => canvas.addEventListener(t, end));
    } else {
      canvas.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
      window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
      window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: false });
      canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: false });
      canvas.addEventListener('touchend', end);
    }
    // Stop the page scrolling while signing on phones.
    canvas.addEventListener('touchmove', (e) => { if (drawing) e.preventDefault(); }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(canvas);
    fit();

    return {
      isEmpty: () => empty,
      clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        empty = true;
      },
      toDataURL() {
        // Export on a white background at a modest size to keep uploads small.
        const out = document.createElement('canvas');
        const w = 600;
        const h = canvas.width ? Math.round((canvas.height / canvas.width) * w) : 170;
        out.width = w;
        out.height = h;
        const o = out.getContext('2d');
        o.fillStyle = '#fff';
        o.fillRect(0, 0, w, h);
        o.drawImage(canvas, 0, 0, w, h);
        return out.toDataURL('image/png');
      },
    };
  }

  // ---------- Helpers ----------
  function isVisible(el) {
    return !el.closest('.hidden');
  }

  function labelFor(el) {
    if (el.dataset.label) return el.dataset.label;
    const row = el.closest('.yn');
    if (row) return row.querySelector('.q').textContent.trim();
    const group = el.closest('[data-group-label]');
    if (group) return group.dataset.groupLabel;
    const check = el.closest('.check');
    if (check) return (check.dataset.label || check.textContent).trim().replace(/\s+/g, ' ');
    const lab = el.closest('label.f');
    if (!lab) return el.name;
    const clone = lab.cloneNode(true);
    clone.querySelectorAll('input,select,textarea,small,.req').forEach((n) => n.remove());
    return clone.textContent.trim().replace(/\s+/g, ' ');
  }

  // Collect visible fields, grouped by the card (section) they sit in.
  function collect(form) {
    const data = {};
    const sections = [];
    form.querySelectorAll('.card[data-section]').forEach((card) => {
      if (!isVisible(card)) return;
      const rows = [];
      const seen = new Set();
      card.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
        if (!isVisible(el) || el.closest('.hp')) return;
        const name = el.name;
        if (el.type === 'radio') {
          if (seen.has(name)) return;
          seen.add(name);
          const checked = card.querySelector(`input[name="${name}"]:checked`);
          data[name] = checked ? checked.value : '';
          rows.push([labelFor(el), checked ? (checked.dataset.display || checked.value) : '—']);
        } else if (el.type === 'checkbox') {
          data[name] = el.checked;
          rows.push([labelFor(el), el.checked ? 'Agreed' : 'Not agreed']);
        } else {
          data[name] = el.value.trim();
          rows.push([labelFor(el), data[name] || '—']);
        }
      });
      sections.push({ title: card.dataset.section, rows });
    });
    return { data, sections };
  }

  function validate(form, pad) {
    const problems = [];
    form.querySelectorAll('.invalid').forEach((n) => n.classList.remove('invalid'));
    form.querySelectorAll('.invalid-row').forEach((n) => n.classList.remove('invalid-row'));

    form.querySelectorAll('[required]').forEach((el) => {
      if (!isVisible(el)) return;
      const bad = el.type === 'checkbox' ? !el.checked : !el.value.trim();
      const badFormat = !bad && el.value && el.checkValidity && !el.checkValidity();
      if (bad || badFormat) {
        (el.closest('.check') || el).classList.add('invalid');
        problems.push(el);
      }
    });
    form.querySelectorAll('.yn[data-required], [data-required-group]').forEach((row) => {
      if (!isVisible(row)) return;
      if (!row.querySelector('input:checked')) {
        row.classList.add('invalid-row');
        problems.push(row);
      }
    });
    const box = form.querySelector('canvas.sig');
    if (pad && pad.isEmpty() && isVisible(box)) {
      box.classList.add('invalid');
      problems.push(box);
    }
    return problems;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderCopy(title, ref, when, sections, signature) {
    let html = `<div class="copy"><h2>${esc(title)}</h2>`;
    html += `<p><strong>Reference:</strong> ${esc(ref)} &nbsp;·&nbsp; <strong>Submitted:</strong> ${esc(when)}</p>`;
    html += `<p>Coach Joseph Gathogo · Chess Coach &amp; School Instructor · ${COACH_PHONE} · chess1elite@gmail.com</p>`;
    sections.forEach((s) => {
      html += `<h3>${esc(s.title)}</h3><table>`;
      s.rows.forEach(([k, v]) => { html += `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`; });
      html += '</table>';
    });
    if (signature) html += `<h3>Signature</h3><img class="sig" alt="Parent signature" src="${signature}">`;
    html += '</div>';
    return html;
  }

  // ---------- Terms gate ----------
  // The agreement boxes stay locked until the parent has scrolled to the end
  // of the terms ([data-terms]). Submit stays locked until every visible
  // agreement box is ticked. The time the terms were read is saved.
  function setupTermsGate(form, submitBtn, submitLabel) {
    const terms = form.querySelector('[data-terms]');
    const group = form.querySelector('.agree-group');
    if (!terms || !group) return;
    const stamp = group.querySelector('input[name="terms_read_at"]');
    const status = group.querySelector('.agree-status');
    let read = false;

    const boxes = () => [...group.querySelectorAll('input[type=checkbox]')].filter(isVisible);
    function update() {
      const all = boxes();
      const done = all.filter((b) => b.checked).length;
      const ok = read && done === all.length;
      submitBtn.disabled = !ok;
      submitBtn.textContent = ok ? submitLabel : (read ? `Tick all boxes to submit (${done} of ${all.length})` : 'Read the terms to continue');
      if (status) status.textContent = read ? `${done} of ${all.length} boxes ticked` : 'Scroll through the terms above to unlock these boxes.';
    }
    function markRead() {
      if (read) return;
      read = true;
      if (stamp) stamp.value = new Date().toISOString();
      group.classList.remove('locked');
      group.querySelectorAll('input[type=checkbox]').forEach((b) => { b.disabled = false; });
      update();
    }
    function check() {
      if (read || !isVisible(terms) || terms.offsetParent === null) return;
      if (terms.scrollTop + terms.clientHeight >= terms.scrollHeight - 24) markRead();
    }
    group.classList.add('locked');
    group.querySelectorAll('input[type=checkbox]').forEach((b) => { b.disabled = true; });
    terms.addEventListener('scroll', check, { passive: true });
    const det = terms.closest('details');
    if (det) det.addEventListener('toggle', () => setTimeout(check, 60));
    group.addEventListener('change', update);
    form.addEventListener('gate:update', update);
    setTimeout(check, 300);
    update();
  }

  // ---------- Wire up a form ----------
  function setupForm(opts) {
    const form = document.getElementById(opts.formId);
    const pad = SignaturePad(form.querySelector('canvas.sig'));
    const clearBtn = form.querySelector('.sig-box .clear');
    const ph = form.querySelector('.sig-box .ph');
    clearBtn.addEventListener('click', () => { pad.clear(); ph.classList.remove('hidden'); });
    form.querySelector('canvas.sig').addEventListener('signed', () => {
      ph.classList.add('hidden');
      form.querySelector('canvas.sig').classList.remove('invalid');
    });

    // Today's date in the signature date field.
    const dateField = form.querySelector('input[name="signed_date"]');
    if (dateField && !dateField.value) dateField.value = new Date().toISOString().slice(0, 10);

    form.addEventListener('input', (e) => {
      const t = e.target;
      t.classList.remove('invalid');
      const c = t.closest('.check'); if (c) c.classList.remove('invalid');
      const r = t.closest('.yn, [data-required-group]'); if (r) r.classList.remove('invalid-row');
    });

    const errBox = form.querySelector('.err-box');
    const submitBtn = form.querySelector('button[type=submit]');
    setupTermsGate(form, submitBtn, opts.submitLabel);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';
      const problems = validate(form, pad);
      if (problems.length) {
        errBox.textContent = `Please complete the ${problems.length} highlighted ${problems.length === 1 ? 'item' : 'items'}.`;
        problems[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const { data, sections } = collect(form);
      if (opts.extraData) Object.assign(data, opts.extraData());
      const signature = pad.toDataURL();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: opts.type,
            policy_version: opts.policyVersion,
            website: form.querySelector('.hp input').value,
            data,
            signature,
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
        const when = new Date().toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
        form.classList.add('hidden');
        const done = document.getElementById('done');
        done.querySelector('.ref').textContent = out.ref;
        done.querySelector('.copy-slot').innerHTML = renderCopy(opts.copyTitle(data), out.ref, when, sections, signature);
        done.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        errBox.textContent = `${err.message} If it keeps failing, WhatsApp ${COACH_PHONE}.`;
        submitBtn.disabled = false;
        submitBtn.textContent = opts.submitLabel;
        form.dispatchEvent(new Event('gate:update'));
      }
    });

    document.getElementById('print-copy').addEventListener('click', () => window.print());
  }

  window.ParentForms = { setupForm, renderCopy, esc };
})();
