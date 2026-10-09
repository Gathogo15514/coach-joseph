// Shared logic for the parent forms: signature pad, validation,
// submission and the printable copy shown after submitting.
(function () {
  'use strict';

  const COACH_PHONE = '0746 451 222';

  // ---------- Signature pad ----------
  function SignaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let empty = true;
    let last = null;

    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const keep = empty ? null : canvas.toDataURL('image/png');
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#13213a';
      if (keep) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = keep;
      }
    }
    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      last = pos(e);
      canvas.setPointerCapture(e.pointerId);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 1, 0, Math.PI * 2);
      ctx.fillStyle = '#13213a';
      ctx.fill();
      empty = false;
      canvas.dispatchEvent(new Event('signed'));
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) =>
      canvas.addEventListener(t, () => { drawing = false; })
    );
    window.addEventListener('resize', resize);
    resize();

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
        const h = Math.round((canvas.height / canvas.width) * w);
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
      }
    });

    document.getElementById('print-copy').addEventListener('click', () => window.print());
  }

  window.ParentForms = { setupForm, renderCopy, esc };
})();
