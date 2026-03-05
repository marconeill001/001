// ─── API Helpers ─────────────────────────────────────────────────────────────

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(path, body) {
    const r = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(path) {
    const r = await fetch(path, { method: 'DELETE' });
    if (!r.ok && r.status !== 204) throw new Error(await r.text());
  }
};

// ─── State ────────────────────────────────────────────────────────────────────

let enums = {};
let currentView = 'dashboard';

// ─── Utilities ───────────────────────────────────────────────────────────────

function fmt(val) { return val || '<span class="muted">—</span>'; }

function stageBadge(stage) {
  return `<span class="tag stage-${CSS.escape ? CSS.escape(stage) : stage.replace(/ /g, '\\ ')}" style="font-size:11px">${stage}</span>`;
}

function priorityBadge(p) {
  return `<span class="priority-badge priority-${p}">${p}</span>`;
}

function timeAgo(iso) {
  const d = new Date(iso + 'Z');
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function stageColor(stage) {
  const map = {
    'Identified': '#475569', 'Research': '#2563eb', 'Outreach': '#3b82f6',
    'Engaged': '#10b981', 'NDA': '#8b5cf6', 'LOI': '#a855f7',
    'Diligence': '#f97316', 'Closed Won': '#22c55e', 'Passed': '#6b7280', 'On Hold': '#78716c'
  };
  return map[stage] || '#475569';
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const modal = {
  open(title, html) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },
  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
};

document.getElementById('modal-close').onclick = () => modal.close();
document.getElementById('modal-overlay').onclick = (e) => {
  if (e.target === document.getElementById('modal-overlay')) modal.close();
};

// ─── Navigation ──────────────────────────────────────────────────────────────

function navigate(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(el => {
    el.classList.toggle('active', el.id === `view-${view}`);
  });
  const titles = { dashboard: 'Dashboard', pipeline: 'Pipeline', companies: 'Companies', contacts: 'Contacts' };
  document.getElementById('topbar-title').textContent = titles[view] || view;
  renderView(view);
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.onclick = () => navigate(btn.dataset.view);
});

async function renderView(view) {
  if (view === 'dashboard') await renderDashboard();
  else if (view === 'pipeline') await renderPipeline();
  else if (view === 'companies') await renderCompanies();
  else if (view === 'contacts') await renderContacts();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

async function renderDashboard() {
  const el = document.getElementById('view-dashboard');
  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = '';

  try {
    const data = await api.get('/api/dashboard');
    const activeStages = ['Identified','Research','Outreach','Engaged','NDA','LOI','Diligence'];
    const totalActive = activeStages.reduce((s, st) => s + (data.deals_by_stage[st] || 0), 0);
    const maxCount = Math.max(...Object.values(data.deals_by_stage), 1);

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Target Companies</div>
          <div class="stat-value accent">${data.total_companies}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Contacts</div>
          <div class="stat-value">${data.total_contacts}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Deals</div>
          <div class="stat-value green">${totalActive}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">High Priority</div>
          <div class="stat-value red">${data.high_priority_deals}</div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="section-title">Pipeline by Stage</div>
          <div class="stage-bars">
            ${enums.deal_stages.map(stage => `
              <div class="stage-row">
                <div class="stage-name">${stage}</div>
                <div class="stage-bar-track">
                  <div class="stage-bar-fill" style="width:${((data.deals_by_stage[stage]||0)/maxCount*100).toFixed(1)}%; background:${stageColor(stage)}"></div>
                </div>
                <div class="stage-count">${data.deals_by_stage[stage] || 0}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="section-title">Recent Activity</div>
          ${data.recent_activity.length ? `
            <div class="activity-list">
              ${data.recent_activity.map(a => `
                <div class="activity-item">
                  <div class="activity-dot" style="background:${noteTypeColor(a.note_type)}"></div>
                  <div>
                    <div class="activity-company">${a.company}</div>
                    <div class="activity-detail">${a.note_type} · ${a.content}</div>
                    <div class="activity-time">${a.author ? a.author + ' · ' : ''}${timeAgo(a.created_at)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty-state" style="padding:20px"><div class="empty-state-text">No activity yet. Start logging calls and emails.</div></div>'}
        </div>
      </div>
    `;
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Error loading dashboard: ${e.message}</div></div>`;
  }
}

function noteTypeColor(type) {
  return { Call: '#10b981', Email: '#3b82f6', Meeting: '#8b5cf6', General: '#64748b', Internal: '#f59e0b' }[type] || '#64748b';
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function renderPipeline() {
  const el = document.getElementById('view-pipeline');
  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = `<button class="btn btn-primary" id="btn-add-deal">+ Add Deal</button>`;
  document.getElementById('btn-add-deal').onclick = showAddDealModal;

  try {
    const [deals, companies] = await Promise.all([
      api.get('/api/deals'),
      api.get('/api/companies')
    ]);
    const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));
    const byStage = {};
    enums.deal_stages.forEach(s => byStage[s] = []);
    deals.forEach(d => { if (byStage[d.stage]) byStage[d.stage].push(d); });

    el.innerHTML = `<div class="pipeline-wrap">
      ${enums.deal_stages.map(stage => `
        <div class="pipeline-col">
          <div class="pipeline-col-header" style="background:${stageColor(stage)}22; color:${stageColor(stage)}; border:1px solid ${stageColor(stage)}44">
            <span>${stage}</span>
            <span>${byStage[stage].length}</span>
          </div>
          <div class="pipeline-cards">
            ${byStage[stage].map(deal => {
              const co = companyMap[deal.company_id];
              return `
                <div class="deal-card" data-deal-id="${deal.id}">
                  <div class="deal-card-name">${co ? co.name : 'Unknown'}</div>
                  <div class="deal-card-meta">
                    ${priorityBadge(deal.priority)}
                    ${deal.assigned_to ? `<span>👤 ${deal.assigned_to}</span>` : ''}
                    ${deal.next_action_date ? `<span>📅 ${deal.next_action_date}</span>` : ''}
                    ${deal.estimated_ev ? `<span>💰 ${deal.estimated_ev}</span>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;

    el.querySelectorAll('.deal-card').forEach(card => {
      card.onclick = () => showDealDetail(parseInt(card.dataset.dealId), companyMap);
    });
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Error: ${e.message}</div></div>`;
  }
}

async function showDealDetail(dealId, companyMap) {
  const deal = await api.get(`/api/deals/${dealId}`);
  const co = companyMap ? companyMap[deal.company_id] : null;
  const coName = co ? co.name : 'Company';

  modal.open(`${coName} — Deal Detail`, `
    <div class="detail-grid">
      <div class="field-group">
        <div class="field-label">Stage</div>
        <div class="field-value">${stageBadge(deal.stage)}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Priority</div>
        <div class="field-value">${priorityBadge(deal.priority)}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Assigned To</div>
        <div class="field-value ${deal.assigned_to ? '' : 'muted'}">${deal.assigned_to || '—'}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Estimated EV</div>
        <div class="field-value ${deal.estimated_ev ? '' : 'muted'}">${deal.estimated_ev || '—'}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Next Action Date</div>
        <div class="field-value ${deal.next_action_date ? '' : 'muted'}">${deal.next_action_date || '—'}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Target Close</div>
        <div class="field-value ${deal.target_close_date ? '' : 'muted'}">${deal.target_close_date || '—'}</div>
      </div>
      ${deal.next_action ? `
        <div class="field-group" style="grid-column:1/-1">
          <div class="field-label">Next Action</div>
          <div class="field-value">${deal.next_action}</div>
        </div>` : ''}
    </div>

    <hr class="divider"/>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="section-title" style="margin:0">Notes</div>
      <button class="btn btn-secondary btn-sm" id="btn-add-note">+ Add Note</button>
    </div>
    <div class="notes-list" id="notes-list">
      ${deal.notes.length ? deal.notes.map(n => noteHtml(n, dealId)).join('') : '<div class="empty-state" style="padding:20px"><div class="empty-state-text">No notes yet.</div></div>'}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" id="btn-edit-deal">Edit Deal</button>
      <button class="btn btn-danger" id="btn-delete-deal">Delete</button>
    </div>
  `);

  document.getElementById('btn-add-note').onclick = () => showAddNoteForm(deal, coName, companyMap);
  document.getElementById('btn-edit-deal').onclick = () => showEditDealModal(deal, coName, companyMap);
  document.getElementById('btn-delete-deal').onclick = async () => {
    if (!confirm(`Delete deal for ${coName}?`)) return;
    await api.del(`/api/deals/${dealId}`);
    modal.close();
    renderPipeline();
  };
}

function noteHtml(n, dealId) {
  return `<div class="note-item" id="note-${n.id}">
    <div class="note-header">
      <div class="note-meta">
        <span class="note-type">${n.note_type}</span>
        ${n.author ? `<span class="note-author">${n.author}</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="note-date">${timeAgo(n.created_at)}</span>
        <button class="btn btn-sm btn-ghost" onclick="deleteNote(${dealId},${n.id})">✕</button>
      </div>
    </div>
    <div class="note-content">${n.content}</div>
  </div>`;
}

async function deleteNote(dealId, noteId) {
  if (!confirm('Delete this note?')) return;
  await api.del(`/api/deals/${dealId}/notes/${noteId}`);
  document.getElementById(`note-${noteId}`)?.remove();
}

function showAddNoteForm(deal, coName, companyMap) {
  modal.open(`Add Note — ${coName}`, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Note Type</label>
        <select class="form-select" id="note-type">
          ${enums.note_types.map(t => `<option>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Author</label>
        <input class="form-input" id="note-author" placeholder="Your name" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Content</label>
        <textarea class="form-textarea" id="note-content" rows="5" placeholder="What happened?"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showDealDetail(${deal.id})">Cancel</button>
      <button class="btn btn-primary" id="btn-save-note">Save Note</button>
    </div>
  `);
  document.getElementById('btn-save-note').onclick = async () => {
    const content = document.getElementById('note-content').value.trim();
    if (!content) return alert('Content is required');
    await api.post(`/api/deals/${deal.id}/notes`, {
      content,
      note_type: document.getElementById('note-type').value,
      author: document.getElementById('note-author').value || null,
    });
    showDealDetail(deal.id, companyMap);
  };
}

function showEditDealModal(deal, coName, companyMap) {
  modal.open(`Edit Deal — ${coName}`, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Stage</label>
        <select class="form-select" id="edit-stage">
          ${enums.deal_stages.map(s => `<option ${s===deal.stage?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="edit-priority">
          ${enums.priorities.map(p => `<option ${p===deal.priority?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assigned To</label>
        <input class="form-input" id="edit-assigned" value="${deal.assigned_to||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Estimated EV</label>
        <input class="form-input" id="edit-ev" value="${deal.estimated_ev||''}" placeholder="e.g. $50M–$100M" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Next Action</label>
        <input class="form-input" id="edit-next-action" value="${deal.next_action||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Next Action Date</label>
        <input class="form-input" type="date" id="edit-next-date" value="${deal.next_action_date||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Target Close Date</label>
        <input class="form-input" type="date" id="edit-close-date" value="${deal.target_close_date||''}" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showDealDetail(${deal.id})">Cancel</button>
      <button class="btn btn-primary" id="btn-save-deal">Save Changes</button>
    </div>
  `);
  document.getElementById('btn-save-deal').onclick = async () => {
    await api.put(`/api/deals/${deal.id}`, {
      stage: document.getElementById('edit-stage').value,
      priority: document.getElementById('edit-priority').value,
      assigned_to: document.getElementById('edit-assigned').value || null,
      estimated_ev: document.getElementById('edit-ev').value || null,
      next_action: document.getElementById('edit-next-action').value || null,
      next_action_date: document.getElementById('edit-next-date').value || null,
      target_close_date: document.getElementById('edit-close-date').value || null,
    });
    modal.close();
    renderPipeline();
  };
}

async function showAddDealModal() {
  const companies = await api.get('/api/companies');
  if (!companies.length) {
    alert('Add a company first before creating a deal.');
    return;
  }
  modal.open('New Deal', `
    <div class="form-grid">
      <div class="form-group form-full">
        <label class="form-label">Company *</label>
        <select class="form-select" id="deal-company">
          ${companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Stage</label>
        <select class="form-select" id="deal-stage">
          ${enums.deal_stages.map(s => `<option>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="deal-priority">
          ${enums.priorities.map(p => `<option>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assigned To</label>
        <input class="form-input" id="deal-assigned" placeholder="e.g. John Smith" />
      </div>
      <div class="form-group">
        <label class="form-label">Estimated EV</label>
        <input class="form-input" id="deal-ev" placeholder="e.g. $50M–$100M" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Next Action</label>
        <input class="form-input" id="deal-next-action" placeholder="e.g. Send intro email to CEO" />
      </div>
      <div class="form-group">
        <label class="form-label">Next Action Date</label>
        <input class="form-input" type="date" id="deal-next-date" />
      </div>
      <div class="form-group">
        <label class="form-label">Target Close Date</label>
        <input class="form-input" type="date" id="deal-close-date" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="modal.close()">Cancel</button>
      <button class="btn btn-primary" id="btn-create-deal">Create Deal</button>
    </div>
  `);
  document.getElementById('btn-create-deal').onclick = async () => {
    await api.post('/api/deals', {
      company_id: parseInt(document.getElementById('deal-company').value),
      stage: document.getElementById('deal-stage').value,
      priority: document.getElementById('deal-priority').value,
      assigned_to: document.getElementById('deal-assigned').value || null,
      estimated_ev: document.getElementById('deal-ev').value || null,
      next_action: document.getElementById('deal-next-action').value || null,
      next_action_date: document.getElementById('deal-next-date').value || null,
      target_close_date: document.getElementById('deal-close-date').value || null,
    });
    modal.close();
    renderPipeline();
  };
}

// ─── Companies ────────────────────────────────────────────────────────────────

async function renderCompanies(search = '', industry = '', ownership = '') {
  const el = document.getElementById('view-companies');
  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = `<button class="btn btn-primary" id="btn-add-company">+ Add Company</button>`;
  document.getElementById('btn-add-company').onclick = showAddCompanyModal;

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (industry) params.set('industry', industry);
  if (ownership) params.set('ownership_type', ownership);

  try {
    const companies = await api.get(`/api/companies?${params}`);

    el.innerHTML = `
      <div class="filter-bar">
        <input class="search-input" id="co-search" placeholder="Search companies..." value="${search}" />
        <input class="search-input" id="co-industry" placeholder="Filter by industry..." value="${industry}" style="min-width:160px" />
        <select class="search-input" id="co-ownership" style="min-width:150px">
          <option value="">All Ownership</option>
          ${enums.ownership_types.map(o => `<option ${o===ownership?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
      ${companies.length ? `
        <div class="card" style="padding:0;overflow:hidden">
          <table class="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Industry</th>
                <th>Ownership</th>
                <th>Revenue</th>
                <th>Geography</th>
                <th>Deal Stage</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              ${companies.map(c => {
                const latestDeal = c.deals?.[0];
                return `<tr data-co-id="${c.id}">
                  <td><strong>${c.name}</strong></td>
                  <td>${c.industry ? `<span class="tag">${c.industry}</span>` : '—'}</td>
                  <td>${c.ownership_type || '—'}</td>
                  <td>${c.revenue_range || '—'}</td>
                  <td>${c.geography || '—'}</td>
                  <td>${latestDeal ? stageBadge(latestDeal.stage) : '—'}</td>
                  <td>${new Date(c.created_at).toLocaleDateString()}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty-state"><div class="empty-state-icon">⊞</div><div class="empty-state-text">No companies yet. Add your first target.</div></div>`}
    `;

    el.querySelector('#co-search').oninput = debounce(e => renderCompanies(e.target.value, el.querySelector('#co-industry').value, el.querySelector('#co-ownership').value), 300);
    el.querySelector('#co-industry').oninput = debounce(e => renderCompanies(el.querySelector('#co-search').value, e.target.value, el.querySelector('#co-ownership').value), 300);
    el.querySelector('#co-ownership').onchange = e => renderCompanies(el.querySelector('#co-search').value, el.querySelector('#co-industry').value, e.target.value);

    el.querySelectorAll('tr[data-co-id]').forEach(row => {
      row.onclick = () => showCompanyDetail(parseInt(row.dataset.coId));
    });
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Error: ${e.message}</div></div>`;
  }
}

async function showCompanyDetail(companyId) {
  const co = await api.get(`/api/companies/${companyId}`);
  modal.open(co.name, `
    <div class="detail-grid">
      <div class="field-group">
        <div class="field-label">Industry</div>
        <div class="field-value">${co.industry || '<span class="muted">—</span>'}${co.sub_industry ? ` / ${co.sub_industry}` : ''}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Ownership</div>
        <div class="field-value">${co.ownership_type}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Revenue Range</div>
        <div class="field-value ${co.revenue_range ? '' : 'muted'}">${co.revenue_range || '—'}</div>
      </div>
      <div class="field-group">
        <div class="field-label">EBITDA Range</div>
        <div class="field-value ${co.ebitda_range ? '' : 'muted'}">${co.ebitda_range || '—'}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Employees</div>
        <div class="field-value ${co.employee_count ? '' : 'muted'}">${co.employee_count || '—'}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Geography</div>
        <div class="field-value ${co.geography ? '' : 'muted'}">${co.geography || '—'}</div>
      </div>
      ${co.website ? `<div class="field-group"><div class="field-label">Website</div><div class="field-value"><a class="link" href="${co.website}" target="_blank">${co.website}</a></div></div>` : ''}
      ${co.source ? `<div class="field-group"><div class="field-label">Source</div><div class="field-value">${co.source}</div></div>` : ''}
    </div>

    ${co.description ? `<div class="form-group" style="margin-bottom:12px"><div class="field-label">Description</div><div class="field-value" style="margin-top:4px;color:var(--text-dim)">${co.description}</div></div>` : ''}
    ${co.deal_rationale ? `<div class="form-group" style="margin-bottom:16px"><div class="field-label">Deal Rationale</div><div class="field-value" style="margin-top:4px;color:var(--text-dim)">${co.deal_rationale}</div></div>` : ''}

    ${co.contacts.length ? `
      <hr class="divider"/>
      <div class="section-title">Contacts (${co.contacts.length})</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${co.contacts.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:6px;border:1px solid var(--border)">
            <div>
              <strong>${c.name}</strong>${c.title ? ` · <span style="color:var(--text-muted)">${c.title}</span>` : ''}
              ${c.email ? `<div style="font-size:12px;color:var(--text-muted)">${c.email}</div>` : ''}
            </div>
            ${c.is_primary ? '<span class="tag" style="font-size:10px">Primary</span>' : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${co.deals.length ? `
      <hr class="divider"/>
      <div class="section-title">Deals</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${co.deals.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:6px;border:1px solid var(--border)">
            <div>${stageBadge(d.stage)} ${priorityBadge(d.priority)}</div>
            ${d.next_action_date ? `<span style="font-size:12px;color:var(--text-muted)">📅 ${d.next_action_date}</span>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="modal-footer">
      <button class="btn btn-secondary" id="btn-add-contact-co">+ Contact</button>
      <button class="btn btn-secondary" id="btn-add-deal-co">+ Deal</button>
      <button class="btn btn-secondary" id="btn-edit-co">Edit</button>
      <button class="btn btn-danger" id="btn-delete-co">Delete</button>
    </div>
  `);

  document.getElementById('btn-add-contact-co').onclick = () => showAddContactModal(co);
  document.getElementById('btn-add-deal-co').onclick = () => showAddDealForCompany(co);
  document.getElementById('btn-edit-co').onclick = () => showEditCompanyModal(co);
  document.getElementById('btn-delete-co').onclick = async () => {
    if (!confirm(`Delete ${co.name} and all associated data?`)) return;
    await api.del(`/api/companies/${companyId}`);
    modal.close();
    renderCompanies();
  };
}

function showAddCompanyModal() {
  modal.open('Add Target Company', `
    <div class="form-grid">
      <div class="form-group form-full">
        <label class="form-label">Company Name *</label>
        <input class="form-input" id="co-name" placeholder="Acme Industries LLC" />
      </div>
      <div class="form-group">
        <label class="form-label">Industry</label>
        <input class="form-input" id="co-ind" placeholder="e.g. Manufacturing" />
      </div>
      <div class="form-group">
        <label class="form-label">Sub-Industry</label>
        <input class="form-input" id="co-subind" placeholder="e.g. Aerospace Components" />
      </div>
      <div class="form-group">
        <label class="form-label">Ownership Type</label>
        <select class="form-select" id="co-own">
          ${enums.ownership_types.map(o => `<option>${o}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Geography</label>
        <input class="form-input" id="co-geo" placeholder="e.g. Midwest, USA" />
      </div>
      <div class="form-group">
        <label class="form-label">Revenue Range</label>
        <input class="form-input" id="co-rev" placeholder="e.g. $20M–$50M" />
      </div>
      <div class="form-group">
        <label class="form-label">EBITDA Range</label>
        <input class="form-input" id="co-ebitda" placeholder="e.g. $3M–$8M" />
      </div>
      <div class="form-group">
        <label class="form-label">Employees</label>
        <input class="form-input" id="co-emp" placeholder="e.g. 100–250" />
      </div>
      <div class="form-group">
        <label class="form-label">Website</label>
        <input class="form-input" id="co-web" placeholder="https://..." />
      </div>
      <div class="form-group">
        <label class="form-label">Source</label>
        <input class="form-input" id="co-src" placeholder="e.g. Proprietary, Referral, Database" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="co-desc" placeholder="Brief company description..."></textarea>
      </div>
      <div class="form-group form-full">
        <label class="form-label">Deal Rationale</label>
        <textarea class="form-textarea" id="co-rat" placeholder="Why is this a compelling acquisition target?"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="modal.close()">Cancel</button>
      <button class="btn btn-primary" id="btn-create-co">Add Company</button>
    </div>
  `);
  document.getElementById('btn-create-co').onclick = async () => {
    const name = document.getElementById('co-name').value.trim();
    if (!name) return alert('Company name is required');
    await api.post('/api/companies', {
      name,
      industry: document.getElementById('co-ind').value || null,
      sub_industry: document.getElementById('co-subind').value || null,
      ownership_type: document.getElementById('co-own').value,
      geography: document.getElementById('co-geo').value || null,
      revenue_range: document.getElementById('co-rev').value || null,
      ebitda_range: document.getElementById('co-ebitda').value || null,
      employee_count: document.getElementById('co-emp').value || null,
      website: document.getElementById('co-web').value || null,
      source: document.getElementById('co-src').value || null,
      description: document.getElementById('co-desc').value || null,
      deal_rationale: document.getElementById('co-rat').value || null,
    });
    modal.close();
    renderCompanies();
  };
}

function showEditCompanyModal(co) {
  modal.open(`Edit — ${co.name}`, `
    <div class="form-grid">
      <div class="form-group form-full">
        <label class="form-label">Company Name *</label>
        <input class="form-input" id="eco-name" value="${co.name}" />
      </div>
      <div class="form-group">
        <label class="form-label">Industry</label>
        <input class="form-input" id="eco-ind" value="${co.industry||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Sub-Industry</label>
        <input class="form-input" id="eco-subind" value="${co.sub_industry||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Ownership Type</label>
        <select class="form-select" id="eco-own">
          ${enums.ownership_types.map(o => `<option ${o===co.ownership_type?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Geography</label>
        <input class="form-input" id="eco-geo" value="${co.geography||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Revenue Range</label>
        <input class="form-input" id="eco-rev" value="${co.revenue_range||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">EBITDA Range</label>
        <input class="form-input" id="eco-ebitda" value="${co.ebitda_range||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Employees</label>
        <input class="form-input" id="eco-emp" value="${co.employee_count||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Website</label>
        <input class="form-input" id="eco-web" value="${co.website||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Source</label>
        <input class="form-input" id="eco-src" value="${co.source||''}" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="eco-desc">${co.description||''}</textarea>
      </div>
      <div class="form-group form-full">
        <label class="form-label">Deal Rationale</label>
        <textarea class="form-textarea" id="eco-rat">${co.deal_rationale||''}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showCompanyDetail(${co.id})">Cancel</button>
      <button class="btn btn-primary" id="btn-save-co">Save Changes</button>
    </div>
  `);
  document.getElementById('btn-save-co').onclick = async () => {
    const name = document.getElementById('eco-name').value.trim();
    if (!name) return alert('Name required');
    await api.put(`/api/companies/${co.id}`, {
      name,
      industry: document.getElementById('eco-ind').value || null,
      sub_industry: document.getElementById('eco-subind').value || null,
      ownership_type: document.getElementById('eco-own').value,
      geography: document.getElementById('eco-geo').value || null,
      revenue_range: document.getElementById('eco-rev').value || null,
      ebitda_range: document.getElementById('eco-ebitda').value || null,
      employee_count: document.getElementById('eco-emp').value || null,
      website: document.getElementById('eco-web').value || null,
      source: document.getElementById('eco-src').value || null,
      description: document.getElementById('eco-desc').value || null,
      deal_rationale: document.getElementById('eco-rat').value || null,
    });
    modal.close();
    renderCompanies();
  };
}

async function showAddDealForCompany(co) {
  modal.open(`New Deal — ${co.name}`, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Stage</label>
        <select class="form-select" id="d-stage">
          ${enums.deal_stages.map(s => `<option>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="d-priority">
          ${enums.priorities.map(p => `<option>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assigned To</label>
        <input class="form-input" id="d-assigned" placeholder="e.g. John Smith" />
      </div>
      <div class="form-group">
        <label class="form-label">Estimated EV</label>
        <input class="form-input" id="d-ev" placeholder="e.g. $50M–$100M" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Next Action</label>
        <input class="form-input" id="d-next" placeholder="e.g. Send intro email" />
      </div>
      <div class="form-group">
        <label class="form-label">Next Action Date</label>
        <input class="form-input" type="date" id="d-next-date" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="showCompanyDetail(${co.id})">Cancel</button>
      <button class="btn btn-primary" id="btn-save-new-deal">Create Deal</button>
    </div>
  `);
  document.getElementById('btn-save-new-deal').onclick = async () => {
    await api.post('/api/deals', {
      company_id: co.id,
      stage: document.getElementById('d-stage').value,
      priority: document.getElementById('d-priority').value,
      assigned_to: document.getElementById('d-assigned').value || null,
      estimated_ev: document.getElementById('d-ev').value || null,
      next_action: document.getElementById('d-next').value || null,
      next_action_date: document.getElementById('d-next-date').value || null,
    });
    modal.close();
    renderCompanies();
  };
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

async function renderContacts() {
  const el = document.getElementById('view-contacts');
  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = `<button class="btn btn-primary" id="btn-add-contact">+ Add Contact</button>`;
  document.getElementById('btn-add-contact').onclick = () => showAddContactModal(null);

  try {
    const [contacts, companies] = await Promise.all([
      api.get('/api/contacts'),
      api.get('/api/companies')
    ]);
    const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));

    el.innerHTML = `
      ${contacts.length ? `
        <div class="card" style="padding:0;overflow:hidden">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>LinkedIn</th>
              </tr>
            </thead>
            <tbody>
              ${contacts.map(c => `
                <tr data-contact-id="${c.id}">
                  <td><strong>${c.name}</strong>${c.is_primary ? ' <span class="tag" style="font-size:10px">Primary</span>' : ''}</td>
                  <td>${c.title || '—'}</td>
                  <td>${companyMap[c.company_id]?.name || '—'}</td>
                  <td>${c.email ? `<a class="link" href="mailto:${c.email}" onclick="event.stopPropagation()">${c.email}</a>` : '—'}</td>
                  <td>${c.phone || '—'}</td>
                  <td>${c.linkedin_url ? `<a class="link" href="${c.linkedin_url}" target="_blank" onclick="event.stopPropagation()">LinkedIn</a>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state"><div class="empty-state-icon">◉</div><div class="empty-state-text">No contacts yet.</div></div>'}
    `;

    el.querySelectorAll('tr[data-contact-id]').forEach(row => {
      row.onclick = () => showEditContactModal(parseInt(row.dataset.contactId));
    });
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Error: ${e.message}</div></div>`;
  }
}

async function showAddContactModal(company) {
  const companies = company ? [company] : await api.get('/api/companies');
  modal.open('Add Contact', `
    <div class="form-grid">
      <div class="form-group form-full">
        <label class="form-label">Company *</label>
        <select class="form-select" id="ct-company">
          ${companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input class="form-input" id="ct-name" placeholder="Jane Smith" />
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="ct-title" placeholder="CEO" />
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="ct-email" type="email" placeholder="jane@acme.com" />
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="ct-phone" placeholder="+1 (555) 000-0000" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">LinkedIn URL</label>
        <input class="form-input" id="ct-linkedin" placeholder="https://linkedin.com/in/..." />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="ct-notes" placeholder="Any relevant notes about this contact..."></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="modal.close()">Cancel</button>
      <button class="btn btn-primary" id="btn-create-ct">Add Contact</button>
    </div>
  `);
  document.getElementById('btn-create-ct').onclick = async () => {
    const name = document.getElementById('ct-name').value.trim();
    if (!name) return alert('Name is required');
    await api.post('/api/contacts', {
      company_id: parseInt(document.getElementById('ct-company').value),
      name,
      title: document.getElementById('ct-title').value || null,
      email: document.getElementById('ct-email').value || null,
      phone: document.getElementById('ct-phone').value || null,
      linkedin_url: document.getElementById('ct-linkedin').value || null,
      notes: document.getElementById('ct-notes').value || null,
    });
    modal.close();
    if (currentView === 'contacts') renderContacts();
    else if (currentView === 'companies') renderCompanies();
  };
}

async function showEditContactModal(contactId) {
  const ct = await api.get(`/api/contacts/${contactId}`);
  modal.open(`Edit Contact — ${ct.name}`, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input class="form-input" id="ect-name" value="${ct.name}" />
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="ect-title" value="${ct.title||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="ect-email" type="email" value="${ct.email||''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="ect-phone" value="${ct.phone||''}" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">LinkedIn URL</label>
        <input class="form-input" id="ect-linkedin" value="${ct.linkedin_url||''}" />
      </div>
      <div class="form-group form-full">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="ect-notes">${ct.notes||''}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-danger" id="btn-del-ct">Delete</button>
      <button class="btn btn-secondary" onclick="modal.close()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-ct">Save Changes</button>
    </div>
  `);
  document.getElementById('btn-save-ct').onclick = async () => {
    const name = document.getElementById('ect-name').value.trim();
    if (!name) return alert('Name required');
    await api.put(`/api/contacts/${contactId}`, {
      name,
      title: document.getElementById('ect-title').value || null,
      email: document.getElementById('ect-email').value || null,
      phone: document.getElementById('ect-phone').value || null,
      linkedin_url: document.getElementById('ect-linkedin').value || null,
      notes: document.getElementById('ect-notes').value || null,
    });
    modal.close();
    renderContacts();
  };
  document.getElementById('btn-del-ct').onclick = async () => {
    if (!confirm(`Delete contact ${ct.name}?`)) return;
    await api.del(`/api/contacts/${contactId}`);
    modal.close();
    renderContacts();
  };
}

// ─── Debounce ─────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  enums = await api.get('/api/enums');
  navigate('dashboard');
}

init();
