// lib/client.js — 写作台右侧栏面板（DSH Web 客户端插件）。
//
// 经典脚本：由宿主 client-modules 以 CJS factory 执行。不要加 import/export/JSX。
window.__ModuleLoader__.load({
  id: 'dsh-writer-studio',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;

    const ReactNS = require('react');
    const R = ReactNS && ReactNS.default && ReactNS.default.createElement ? ReactNS.default : ReactNS;
    const h = R.createElement;
    const useState = R.useState;
    const useEffect = R.useEffect;
    const useRef = R.useRef;

    const API_BASE = '/api/writer-studio';
    const FENCE = 'x-dsh-writer-studio';
    const TAB_ID = 'dsh-writer-studio';
    const TAB_KIND = 'writer-studio';
    const VERSION = '0.4.0';
    const ICON_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDEyLjQ4MDQ3IDEyLjQzMTA3Ij48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMzLjc1MTUzLC0xNzMuNzg0NDYpIj48ZyBzdHJva2U9Im5vbmUiIHN0cm9rZS1taXRlcmxpbWl0PSIxMCI+PGcgc3Ryb2tlLXdpZHRoPSIwIj48cGF0aCBkPSJNMjM0LjMyMTU3LDE3Ny44MzA3MmwzLjUwOTE0LC0zLjUwOTE0bDcuODQ3NzEsNy44NDc3MWwtMy41MDkxNCwzLjUwOTE0eiIgZmlsbD0iIzJlNzdmZiIvPjxnIGZpbGw9IiM2YjlmZmYiPjxwYXRoIGQ9Ik0yNDYuMjE1NTQsMTgzLjA1NzMxdjMuMTU4MjNoLTMuMTU4MjN6Ii8+PHBhdGggZD0iTTIzMy43ODQ0NywxNzYuOTQyN3YtMy4xNTgyM2gzLjE1ODIzeiIvPjwvZz48L2c+PHBhdGggZD0iTTIzMy43NTE1NCwxODYuMTgyNjF2LTYuOTI3MDFsNi45MjcwMSw2LjkyNzAxeiIgZmlsbD0iIzk3YmJmZiIgc3Ryb2tlLXdpZHRoPSIwIi8+PHBhdGggZD0iTTI0Ni4yMzIsMTczLjgxNzM5djYuOTI3MDFsLTYuOTI3MDEsLTYuOTI3MDF6IiBmaWxsPSIjOTdiYmZmIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PC9nPjwvc3ZnPg==';

    const ACCENT = '#4f8cff';
    const BORDER = 'rgba(127,127,127,.28)';
    const SOFT = 'rgba(127,127,127,.10)';
    const MUTED = 'rgba(127,127,127,.95)';

    const TONES = [['plain', '直白粗俗'], ['casual', '口语自然'], ['standard', '标准叙事'], ['elegant', '优雅细腻'], ['literary', '文学性强']];
    const FOCUS = [['character', '侧重人物'], ['balanced', '人物景物各半'], ['scene', '侧重景物']];
    const CHAR_FOCUS = [['dialogue', '语言'], ['action', '动作'], ['appearance', '外貌'], ['inner', '心理']];
    const PERSON = [['first', '第一人称'], ['third', '第三人称限知'], ['omniscient', '第三人称全知']];
    const ADHERENCE = [['strict', '完全按要求'], ['standard', '标准'], ['free', '自由发挥']];
    const PACING = [['direct', '直入正题'], ['build', '层层铺垫'], ['suspense', '悬念先行']];
    const SENTENCE = [['short', '短句为主'], ['medium', '长短交错'], ['long', '长句为主']];
    const ROLES = ['主角', '女主角', '配角', '反派', '导师', '对手', '路人'];
    const GENDERS = ['男', '女', '其他'];
    const GENRES = [
      '玄幻', '奇幻', '武侠', '仙侠', '都市', '现实', '悬疑', '推理', '科幻',
      '末世', '历史', '军事', '游戏', '体育', '言情', '校园', '恐怖',
      '无限流', '克苏鲁', '赛博朋克', '种田', '群像', '同人', '轻小说',
      '灵异', '规则怪谈', '废土', '星际', '宫廷', '宅斗', '快穿', '诸天',
      '重生', '穿越', '甜宠', '虐恋', '无CP', '日常', '治愈', '沙雕',
      '黑暗', '硬科幻', '蒸汽朋克', '权谋', '战争', '冒险', '美食',
    ];
    const LOCATION_TYPES = ['城市', '城镇', '村庄', '建筑', '区域', '秘境', '遗迹', '据点', '其他'];
    const BRANCH_KINDS = [
      ['main', '主线'],
      ['if', 'if线'],
      ['prequel', '前传'],
      ['sequel', '后传'],
      ['side', '外传'],
      ['extra', '番外'],
      ['other', '其他'],
    ];

    const S = {
      root: {
        display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 12px 24px',
        height: '100%', boxSizing: 'border-box', overflowY: 'auto', fontSize: 13,
        lineHeight: 1.55, color: 'inherit',
      },
      title: { fontSize: 15, fontWeight: 650, letterSpacing: '.2px' },
      sub: { fontSize: 11.5, opacity: 0.62 },
      card: { border: `1px solid ${BORDER}`, borderRadius: 10, padding: 10, background: SOFT },
      label: { fontSize: 11.5, opacity: 0.72, marginBottom: 3, display: 'block' },
      input: {
        width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 7,
        border: `1px solid ${BORDER}`, background: 'rgba(127,127,127,.08)', color: 'inherit',
        fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
      },
      textarea: {
        width: '100%', boxSizing: 'border-box', padding: '7px 8px', borderRadius: 7,
        border: `1px solid ${BORDER}`, background: 'rgba(127,127,127,.08)', color: 'inherit',
        fontSize: 12.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
      },
      row: { display: 'flex', gap: 8, alignItems: 'center' },
      wrap: { display: 'flex', flexWrap: 'wrap', gap: 6 },
      badge: {
        fontSize: 10.5, padding: '2px 7px', borderRadius: 999, border: `1px solid ${BORDER}`,
        opacity: 0.85, whiteSpace: 'nowrap',
      },
      chip: {
        fontSize: 11.5, padding: '3px 8px', borderRadius: 999, border: `1px solid ${BORDER}`,
        background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit',
      },
      tab: (active) => ({
        flex: '1 1 0', padding: '5px 4px', fontSize: 12, borderRadius: 7,
        border: `1px solid ${active ? ACCENT : 'transparent'}`,
        background: active ? 'rgba(79,140,255,.14)' : 'transparent',
        color: active ? ACCENT : 'inherit', cursor: 'pointer', fontFamily: 'inherit',
        fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
      }),
      btn: (primary, small, danger) => ({
        padding: small ? '3px 8px' : '5px 11px', fontSize: small ? 11.5 : 12.5,
        borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
        border: `1px solid ${danger ? '#d9534f' : primary ? ACCENT : BORDER}`,
        background: primary ? ACCENT : 'transparent',
        color: primary ? '#fff' : danger ? '#e06c6c' : 'inherit',
        opacity: 1, whiteSpace: 'nowrap',
      }),
      ai: {
        border: `1px dashed ${BORDER}`, borderRadius: 8, padding: 8,
        display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(79,140,255,.04)',
      },
      err: { color: '#e06c6c', fontSize: 11.5, whiteSpace: 'pre-wrap' },
      notice: { color: '#3fb950', fontSize: 11.5, whiteSpace: 'pre-wrap' },
      muted: { fontSize: 11.5, opacity: 0.62 },
      divider: { height: 1, background: BORDER, margin: '2px 0' },
    };

    async function apiFetch(path, init) {
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          [FENCE]: '1',
          ...(init && init.headers ? init.headers : {}),
        },
      });
      let body = null;
      try { body = await res.json(); } catch { /* non-json */ }
      if (!res.ok || (body && body.ok === false)) {
        const message = body?.error?.message || `请求失败（HTTP ${res.status}）`;
        throw new Error(message);
      }
      return body;
    }

    function countChars(text) {
      return Array.from(String(text || '').replace(/\s+/g, '')).length;
    }

    function fmtWords(n) {
      return Number(n) >= 10000 ? `${(Number(n) / 10000).toFixed(1)} 万` : String(Number(n) || 0);
    }

    function emptyCharacter() {
      return {
        id: '', name: '', gender: '', age: '', appearance: '', personality: '',
        identity: '', role: '配角', speech: '', notes: '',
      };
    }

    function emptyLocation() {
      return {
        id: '', name: '', type: '区域', parentId: '', links: [],
        description: '', atmosphere: '', rules: '', secrets: '', notes: '',
      };
    }

    function Btn(props) {
      const { children, onClick, primary, small, danger, disabled, title, style } = props;
      return h('button', {
        type: 'button',
        title,
        disabled: Boolean(disabled),
        onClick: disabled ? undefined : onClick,
        style: { ...S.btn(primary, small, danger), ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}), ...(style || {}) },
      }, children);
    }

    function Field(props) {
      return h('label', { style: { display: 'block', marginBottom: 7 } },
        h('span', { style: S.label }, props.label),
        props.children,
        props.hint ? h('div', { style: { ...S.sub, marginTop: 2 } }, props.hint) : null);
    }

    function Select(props) {
      return h('select', {
        value: props.value,
        onChange: (e) => props.onChange(e.target.value),
        style: { ...S.input, cursor: 'pointer' },
      }, props.options.map(([value, label]) => h('option', { key: value, value }, label)));
    }

    function AiBox(props) {
      return h('div', { style: S.ai },
        h('div', { style: { ...S.row, justifyContent: 'space-between' } },
          h('span', { style: { fontSize: 11.5, opacity: 0.8 } }, props.title || 'AI 生成 / 修改'),
          props.busy ? h('span', { style: S.sub }, '生成中…') : null),
        h('textarea', {
          value: props.value,
          placeholder: props.placeholder || '写下你的要求，例如：性格更阴郁一点；或留空让它自由发挥',
          onChange: (e) => props.onChange(e.target.value),
          rows: 2,
          style: S.textarea,
        }),
        h('div', { style: { ...S.row, justifyContent: 'flex-end' } },
          h(Btn, { small: true, primary: true, disabled: props.busy, onClick: props.onRun }, props.busy ? '请稍候…' : '开始生成')),
        props.error ? h('div', { style: S.err }, props.error) : null);
    }

    function CreateBook(props) {
      const [title, setTitle] = useState('');
      const [genre, setGenre] = useState('');
      const [min, setMin] = useState('2000');
      const [max, setMax] = useState('4000');
      const [target, setTarget] = useState('3000');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const submit = async () => {
        if (!title.trim()) { setError('先给作品起个名字'); return; }
        setBusy(true); setError('');
        try {
          await props.onCreate({
            title: title.trim(), genre: genre.trim(),
            chars: { min: Number(min), max: Number(max), target: Number(target) },
          });
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      };
      return h('div', { style: { ...S.card, display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: S.title }, '新建作品'),
        h('div', { style: S.sub }, '字数区间在开书时定下，之后每章按它强制校验。'),
        h(Field, { label: '书名' }, h('input', { style: S.input, value: title, onChange: (e) => setTitle(e.target.value), placeholder: '例如：长夜灯' })),
        h(Field, { label: '类型（可选择，也可自填）' },
          h('input', { style: S.input, value: genre, onChange: (e) => setGenre(e.target.value), list: 'ws-genres-create', placeholder: '玄幻 / 悬疑 / 都市…' }),
          h('datalist', { id: 'ws-genres-create' }, GENRES.map((g) => h('option', { key: g, value: g })))),
        h('div', { style: { ...S.row, alignItems: 'flex-end' } },
          h(Field, { label: '下限' }, h('input', { style: S.input, value: min, onChange: (e) => setMin(e.target.value), inputMode: 'numeric' })),
          h(Field, { label: '目标' }, h('input', { style: S.input, value: target, onChange: (e) => setTarget(e.target.value), inputMode: 'numeric' })),
          h(Field, { label: '上限' }, h('input', { style: S.input, value: max, onChange: (e) => setMax(e.target.value), inputMode: 'numeric' }))),
        error ? h('div', { style: S.err }, error) : null,
        h('div', null, h(Btn, { primary: true, disabled: busy, onClick: submit }, busy ? '创建中…' : '创建作品')));
    }

    function BookTab(props) {
      const book = props.book;
      const [draft, setDraft] = useState(() => ({
        title: book.title || '', genre: book.genre || '', logline: book.logline || '',
        synopsis: book.synopsis || '',
        min: String(book.chars.min), max: String(book.chars.max), target: String(book.chars.target),
      }));
      useEffect(() => {
        setDraft({
          title: book.title || '', genre: book.genre || '', logline: book.logline || '',
          synopsis: book.synopsis || '',
          min: String(book.chars.min), max: String(book.chars.max), target: String(book.chars.target),
        });
      }, [book.id, book.updatedAt]);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [aiOpen, setAiOpen] = useState(false);
      const [aiText, setAiText] = useState('');
      const [aiBusy, setAiBusy] = useState(false);
      const [aiError, setAiError] = useState('');
      const [titles, setTitles] = useState([]);
      const [synAiOpen, setSynAiOpen] = useState(false);
      const [synAiText, setSynAiText] = useState('');
      const [synAiBusy, setSynAiBusy] = useState(false);
      const [synAiError, setSynAiError] = useState('');
      const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
      const save = async () => {
        setBusy(true); setError('');
        try {
          await props.onSave({
            title: draft.title, genre: draft.genre, logline: draft.logline, synopsis: draft.synopsis,
            chars: { min: Number(draft.min), max: Number(draft.max), target: Number(draft.target) },
          });
          props.flash('作品设定已保存');
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      };
      const runAi = async () => {
        setAiBusy(true); setAiError('');
        try {
          const result = await props.callAi('title', aiText, null);
          const list = Array.isArray(result.data) ? result.data : [];
          setTitles(list);
          if (list.length === 0) setAiError('模型没有给出书名列表，重试一次');
        } catch (e) { setAiError(e.message); } finally { setAiBusy(false); }
      };
      const runSynopsisAi = async () => {
        setSynAiBusy(true); setSynAiError('');
        try {
          const result = await props.callAi('synopsis', synAiText, null);
          setDraft((d) => ({ ...d, synopsis: result.text || '' }));
          props.flash('AI 已生成简介草稿，确认后保存');
        } catch (e) { setSynAiError(e.message); } finally { setSynAiBusy(false); }
      };
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: S.card },
          h('div', { style: { ...S.row, justifyContent: 'space-between', marginBottom: 6 } },
            h('div', { style: S.title }, '书籍档案'),
            h(Btn, { small: true, onClick: () => setAiOpen((v) => !v) }, aiOpen ? '收起起名' : 'AI 起名')),
          aiOpen ? h('div', { style: { marginBottom: 8 } },
            h(AiBox, {
              title: 'AI 起名', value: aiText, onChange: setAiText, busy: aiBusy, error: aiError, onRun: runAi,
              placeholder: '想要的气质、关键词、避开的套路（可留空）',
            }),
            titles.length > 0 ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 } },
              titles.map((t, i) => h('button', {
                key: i, type: 'button',
                onClick: () => { setDraft((d) => ({ ...d, title: t.title || String(t) })); setTitles([]); setAiOpen(false); },
                style: { ...S.chip, textAlign: 'left', borderRadius: 7 },
              }, `${t.title || t}${t.reason ? ` — ${t.reason}` : ''}`))) : null) : null,
          h(Field, { label: '书名' }, h('input', { style: S.input, value: draft.title, onChange: set('title') })),
          h(Field, { label: '类型（可选择，也可自填）' },
            h('input', { style: S.input, value: draft.genre, onChange: set('genre'), list: 'ws-genres', placeholder: '玄幻 / 悬疑 / 都市…' }),
            h('datalist', { id: 'ws-genres' }, GENRES.map((g) => h('option', { key: g, value: g })))),
          h(Field, { label: '一句话立意' }, h('input', { style: S.input, value: draft.logline, onChange: set('logline') })),
          h('div', { style: { ...S.row, justifyContent: 'space-between', marginBottom: 4 } },
            h('span', { style: S.label }, '简介 / 故事梗概'),
            h(Btn, { small: true, onClick: () => setSynAiOpen((v) => !v) }, synAiOpen ? '收起生成' : 'AI 生成简介')),
          synAiOpen ? h('div', { style: { marginBottom: 6 } },
            h(AiBox, {
              title: '根据世界观、地点、角色生成简介',
              value: synAiText, onChange: setSynAiText, busy: synAiBusy, error: synAiError, onRun: runSynopsisAi,
              placeholder: '可留空；或写「更偏悬疑」「不要剧透结局」「突出双主角」',
            })) : null,
          h(Field, { label: '' }, h('textarea', { style: S.textarea, rows: 5, value: draft.synopsis, onChange: set('synopsis'), placeholder: '这本书讲什么、主角要什么、最大的阻碍是什么' })),
          h('div', { style: { ...S.divider, margin: '8px 0' } }),
          h('div', { style: S.label }, '每章字数（写作前锁定，落盘强制校验）'),
          h('div', { style: { ...S.row, alignItems: 'flex-end' } },
            h(Field, { label: '下限' }, h('input', { style: S.input, value: draft.min, onChange: set('min'), inputMode: 'numeric' })),
            h(Field, { label: '目标' }, h('input', { style: S.input, value: draft.target, onChange: set('target'), inputMode: 'numeric' })),
            h(Field, { label: '上限' }, h('input', { style: S.input, value: draft.max, onChange: set('max'), inputMode: 'numeric' }))),
          error ? h('div', { style: S.err }, error) : null,
          h('div', { style: { ...S.row, justifyContent: 'space-between', marginTop: 8 } },
            h(Btn, { primary: true, disabled: busy, onClick: save }, busy ? '保存中…' : '保存设定'),
            h(Btn, { small: true, danger: true, onClick: () => {
              if (window.confirm(`删除《${book.title}》及其全部章节？此操作不可撤销。`)) props.onDelete();
            } }, '删除作品'))),
        h('div', { style: { ...S.card, ...S.sub } },
          `共 ${book.chapters.length} 章 · 已写 ${fmtWords(book.chapters.reduce((n, c) => n + c.words, 0))} 字 · 角色 ${book.characters.length} 人 · 地点 ${(book.locations || []).length} 处`));
    }

    function CharactersTab(props) {
      const book = props.book;
      const [editing, setEditing] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [aiBusy, setAiBusy] = useState(false);
      const [aiError, setAiError] = useState('');
      const [aiText, setAiText] = useState('');
      const startNew = () => { setEditing(emptyCharacter()); setAiText(''); setAiError(''); };
      const startEdit = (c) => { setEditing({ ...c }); setAiText(''); setAiError(''); };
      const set = (key) => (e) => setEditing((d) => ({ ...d, [key]: e.target.value }));
      const save = async () => {
        if (!editing.name.trim()) { setError('角色姓名不能为空'); return; }
        setBusy(true); setError('');
        try {
          await props.onSaveCharacter(editing);
          setEditing(null);
          props.flash('角色已保存');
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      };
      const remove = async (c) => {
        if (!window.confirm(`删除角色「${c.name}」？`)) return;
        try { await props.onDeleteCharacter(c.id); props.flash('角色已删除'); } catch (e) { props.flash(e.message); }
      };
      const runAi = async () => {
        setAiBusy(true); setAiError('');
        try {
          const result = await props.callAi('character', aiText, editing && (editing.name || editing.id) ? editing : null);
          if (result.data && typeof result.data === 'object') {
            setEditing((d) => ({ ...(d || emptyCharacter()), ...result.data, id: (d && d.id) || '' }));
            props.flash('AI 已填入角色卡，确认后保存');
          } else throw new Error('模型没有返回可用的角色 JSON');
        } catch (e) { setAiError(e.message); } finally { setAiBusy(false); }
      };

      if (editing) {
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('div', { style: S.title }, editing.id ? '编辑角色' : '新增角色'),
            h(Btn, { small: true, onClick: () => setEditing(null) }, '返回列表')),
          h(AiBox, { title: 'AI 生成 / 修改这个角色', value: aiText, onChange: setAiText, busy: aiBusy, error: aiError, onRun: runAi }),
          h(Field, { label: '姓名' }, h('input', { style: S.input, value: editing.name, onChange: set('name') })),
          h('div', { style: S.row },
            h(Field, { label: '性别' },
              h('input', { style: S.input, value: editing.gender || '', onChange: set('gender'), list: 'ws-genders', placeholder: '男 / 女 / 其他' }),
              h('datalist', { id: 'ws-genders' }, GENDERS.map((g) => h('option', { key: g, value: g })))),
            h(Field, { label: '年龄' }, h('input', { style: S.input, value: editing.age, onChange: set('age'), placeholder: '例如 17 / 不详' }))),
          h('div', { style: S.row },
            h(Field, { label: '故事定位' }, h('input', { style: S.input, value: editing.role, onChange: set('role'), list: 'ws-roles', placeholder: '主角 / 配角 / 反派…' })),
            h('datalist', { id: 'ws-roles' }, ROLES.map((r) => h('option', { key: r, value: r })))),
          h(Field, { label: '身份' }, h('input', { style: S.input, value: editing.identity, onChange: set('identity'), placeholder: '职业、阵营、立场' })),
          h(Field, { label: '外貌' }, h('textarea', { style: S.textarea, rows: 3, value: editing.appearance, onChange: set('appearance') })),
          h(Field, { label: '性格' }, h('textarea', { style: S.textarea, rows: 3, value: editing.personality, onChange: set('personality') })),
          h(Field, { label: '语言特征', hint: '口头禅、句长、绝不说的话——防止所有角色一个腔调' }, h('input', { style: S.input, value: editing.speech, onChange: set('speech') })),
          h(Field, { label: '补充' }, h('textarea', { style: S.textarea, rows: 2, value: editing.notes, onChange: set('notes') })),
          error ? h('div', { style: S.err }, error) : null,
          h('div', { style: { ...S.row, justifyContent: 'flex-end' } },
            h(Btn, { onClick: () => setEditing(null) }, '取消'),
            h(Btn, { primary: true, disabled: busy, onClick: save }, busy ? '保存中…' : '保存角色')));
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { style: { ...S.row, justifyContent: 'space-between' } },
          h('div', { style: S.title }, `角色卡 · ${book.characters.length} 人`),
          h(Btn, { small: true, primary: true, onClick: startNew }, '＋ 新增角色')),
        book.characters.length === 0 ? h('div', { style: { ...S.card, ...S.muted } }, '还没有角色。先建主角与关键配角，AI 可以根据题材和梗概起草。') : null,
        book.characters.map((c) => h('div', { key: c.id, style: S.card },
          h('div', { style: { ...S.row, justifyContent: 'space-between', alignItems: 'flex-start' } },
            h('div', { style: { minWidth: 0 } },
              h('div', { style: { fontWeight: 600 } }, c.name, h('span', { style: { ...S.badge, marginLeft: 6 } }, c.role || '角色')),
              h('div', { style: { ...S.sub, marginTop: 2 } }, [c.gender, c.age && `${c.age}岁`, c.identity].filter(Boolean).join(' · ') || '未填写身份'),
              c.personality ? h('div', { style: { ...S.muted, marginTop: 4 } }, c.personality.slice(0, 90) + (c.personality.length > 90 ? '…' : '')) : null),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              h(Btn, { small: true, onClick: () => startEdit(c) }, '编辑'),
              h(Btn, { small: true, danger: true, onClick: () => remove(c) }, '删除'))))));
    }

    function LocationsSection(props) {
      const book = props.book;
      const locations = book.locations || [];
      const [editing, setEditing] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [aiText, setAiText] = useState('');
      const [aiBusy, setAiBusy] = useState(false);
      const [aiError, setAiError] = useState('');
      const byId = new Map(locations.map((loc) => [loc.id, loc]));

      const startNew = () => { setEditing(emptyLocation()); setAiText(''); setAiError(''); setError(''); };
      const startEdit = (loc) => { setEditing({ ...loc, links: [...(loc.links || [])] }); setAiText(''); setAiError(''); setError(''); };
      const setField = (key) => (e) => setEditing((d) => ({ ...d, [key]: e.target.value }));
      const toggleLink = (id) => setEditing((d) => {
        const links = Array.isArray(d.links) ? d.links : [];
        return { ...d, links: links.includes(id) ? links.filter((x) => x !== id) : [...links, id] };
      });
      const save = async () => {
        if (!editing.name.trim()) { setError('地点名称不能为空'); return; }
        setBusy(true); setError('');
        try {
          const base = `/books/${encodeURIComponent(book.id)}/locations`;
          if (editing.id) {
            await apiFetch(`${base}/${encodeURIComponent(editing.id)}`, { method: 'PUT', body: JSON.stringify(editing) });
          } else {
            await apiFetch(base, { method: 'POST', body: JSON.stringify(editing) });
          }
          setEditing(null);
          await props.reload();
          props.flash('地点已保存');
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      };
      const remove = async (loc) => {
        if (!window.confirm(`删除地点「${loc.name}」？子地点会变成顶级地点，关联会被移除。`)) return;
        try {
          await apiFetch(`/books/${encodeURIComponent(book.id)}/locations/${encodeURIComponent(loc.id)}`, { method: 'DELETE' });
          await props.reload();
          props.flash('地点已删除');
        } catch (e) { props.flash(e.message); }
      };
      const runAi = async () => {
        setAiBusy(true); setAiError('');
        try {
          const result = await props.callAi('location', aiText, editing && (editing.name || editing.id) ? editing : null);
          const data = result.data;
          if (!data || typeof data !== 'object') throw new Error('模型没有返回可用的地点 JSON');
          const parentName = typeof data.parentName === 'string' ? data.parentName : '';
          const parentId = (typeof data.parentId === 'string' && locations.some((loc) => loc.id === data.parentId))
            ? data.parentId
            : (parentName ? locations.find((loc) => loc.name === parentName)?.id : '') || '';
          const linkNames = Array.isArray(data.linkNames) ? data.linkNames : [];
          const rawLinks = Array.isArray(data.links) && data.links.length > 0 ? data.links : linkNames;
          const links = rawLinks
            .map((value) => (locations.some((loc) => loc.id === value) ? value : locations.find((loc) => loc.name === String(value))?.id))
            .filter(Boolean);
          setEditing((d) => ({
            ...(d || emptyLocation()),
            ...data,
            id: (d && d.id) || '',
            parentId,
            links,
          }));
          props.flash('AI 已填入地点草稿，确认后保存');
        } catch (e) { setAiError(e.message); } finally { setAiBusy(false); }
      };

      if (editing) {
        const others = locations.filter((loc) => loc.id !== editing.id);
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('div', { style: S.title }, editing.id ? '编辑地点' : '新增地点'),
            h(Btn, { small: true, onClick: () => setEditing(null) }, '返回地点列表')),
          h(AiBox, {
            title: 'AI 生成 / 修改这个地点', value: aiText, onChange: setAiText,
            busy: aiBusy, error: aiError, onRun: runAi,
            placeholder: '例如：地下黑市，和主线里的失踪案有关；或者“把它拆成三个子地点”',
          }),
          h(Field, { label: '名称' }, h('input', { style: S.input, value: editing.name, onChange: setField('name'), placeholder: '例如：雾港、钟楼、北境哨站' })),
          h(Field, { label: '类型（可选择，也可自填）' },
            h('input', { style: S.input, value: editing.type, onChange: setField('type'), list: 'ws-loc-types' }),
            h('datalist', { id: 'ws-loc-types' }, LOCATION_TYPES.map((t) => h('option', { key: t, value: t })))),
          h(Field, { label: '包含于（上级地点）' },
            h(Select, {
              value: editing.parentId || '',
              onChange: (v) => setEditing((d) => ({ ...d, parentId: v })),
              options: [['', '（顶级地点）'], ...others.map((loc) => [loc.id, `${loc.name}（${loc.type}）`])],
            }),
            h('div', { style: S.sub }, '子地点会显示在上级地点下面；上级地点可以继续包含更小的场所。')),
          h('div', { style: { marginBottom: 8 } },
            h('span', { style: S.label }, '串联 / 关联地点（可多选）'),
            others.length === 0
              ? h('div', { style: S.muted }, '还没有其他地点。')
              : h('div', { style: { ...S.wrap, maxHeight: 160, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 7, padding: 6 } },
                others.map((loc) => h('button', {
                  key: loc.id, type: 'button', onClick: () => toggleLink(loc.id),
                  style: {
                    ...S.chip,
                    borderColor: (editing.links || []).includes(loc.id) ? ACCENT : BORDER,
                    color: (editing.links || []).includes(loc.id) ? ACCENT : 'inherit',
                  },
                }, loc.name)))),
          h(Field, { label: '描述（看得见的空间）' }, h('textarea', { style: S.textarea, rows: 4, value: editing.description, onChange: setField('description') })),
          h(Field, { label: '氛围' }, h('textarea', { style: S.textarea, rows: 2, value: editing.atmosphere, onChange: setField('atmosphere') })),
          h(Field, { label: '规则 / 禁忌' }, h('textarea', { style: S.textarea, rows: 2, value: editing.rules, onChange: setField('rules') })),
          h(Field, { label: '秘密 / 剧情钩子' }, h('textarea', { style: S.textarea, rows: 3, value: editing.secrets, onChange: setField('secrets') })),
          h(Field, { label: '备注' }, h('textarea', { style: S.textarea, rows: 2, value: editing.notes, onChange: setField('notes') })),
          error ? h('div', { style: S.err }, error) : null,
          h('div', { style: { ...S.row, justifyContent: 'flex-end' } },
            h(Btn, { onClick: () => setEditing(null) }, '取消'),
            h(Btn, { primary: true, disabled: busy, onClick: save }, busy ? '保存中…' : '保存地点')));
      }

      // 按「包含」关系排序并缩进；父级丢失/成环的条目平铺在末尾。
      const ordered = [];
      const children = new Map();
      for (const loc of locations) {
        const key = loc.parentId && byId.has(loc.parentId) ? loc.parentId : '';
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(loc);
      }
      const visited = new Set();
      const walk = (parentId, depth) => {
        for (const loc of children.get(parentId) ?? []) {
          if (visited.has(loc.id)) continue;
          visited.add(loc.id);
          ordered.push({ loc, depth });
          walk(loc.id, depth + 1);
        }
      };
      walk('', 0);
      for (const loc of locations) if (!visited.has(loc.id)) ordered.push({ loc, depth: 0 });

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { style: { ...S.row, justifyContent: 'space-between' } },
          h('div', { style: S.title }, `重要地点 · ${locations.length} 处`),
          h(Btn, { small: true, primary: true, onClick: startNew }, '＋ 新增地点')),
        h('div', { style: { ...S.card, ...S.sub } },
          '地点支持「包含」：城市 → 街区 → 建筑；也支持「串联」：把相关地点关联起来。这些关系会进入每章的上下文包。'),
        locations.length === 0 ? h('div', { style: { ...S.card, ...S.muted } }, '还没有地点。可以先让 AI 按题材生成一个主城，再拆子地点。') : null,
        ordered.map(({ loc, depth }) => {
          const parent = loc.parentId ? byId.get(loc.parentId) : null;
          const linkNames = (loc.links || []).map((id) => byId.get(id)?.name).filter(Boolean);
          return h('div', { key: loc.id, style: { ...S.card, marginLeft: Math.min(depth, 4) * 10 } },
            h('div', { style: { ...S.row, justifyContent: 'space-between', alignItems: 'flex-start' } },
              h('div', { style: { minWidth: 0 } },
                h('div', { style: { fontWeight: 600 } },
                  loc.name,
                  h('span', { style: { ...S.badge, marginLeft: 6 } }, loc.type || '地点')),
                h('div', { style: { ...S.sub, marginTop: 2 } },
                  [parent ? `包含于 ${parent.name}` : '顶级地点', linkNames.length ? `串联 ${linkNames.join('、')}` : ''].filter(Boolean).join(' · ')),
                loc.description ? h('div', { style: { ...S.muted, marginTop: 4 } }, loc.description.slice(0, 90) + (loc.description.length > 90 ? '…' : '')) : null),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                h(Btn, { small: true, onClick: () => startEdit(loc) }, '编辑'),
                h(Btn, { small: true, danger: true, onClick: () => remove(loc) }, '删除'))));
        }));
    }

    function WorldTab(props) {
      const book = props.book;
      const [text, setText] = useState(book.worldview || '');
      useEffect(() => { setText(book.worldview || ''); }, [book.id, book.updatedAt]);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [aiText, setAiText] = useState('');
      const [aiBusy, setAiBusy] = useState(false);
      const [aiError, setAiError] = useState('');
      const save = async () => {
        setBusy(true); setError('');
        try { await props.onSave({ worldview: text }); props.flash('世界观已保存'); }
        catch (e) { setError(e.message); } finally { setBusy(false); }
      };
      const runAi = async () => {
        setAiBusy(true); setAiError('');
        try {
          const result = await props.callAi('world', aiText, null);
          setText(result.text || '');
          props.flash('AI 已生成世界观草稿，确认后保存');
        } catch (e) { setAiError(e.message); } finally { setAiBusy(false); }
      };
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { style: S.title }, '世界观 / 时代背景'),
        h(AiBox, { title: 'AI 生成 / 改写世界观', value: aiText, onChange: setAiText, busy: aiBusy, error: aiError, onRun: runAi, placeholder: '例如：蒸汽朋克 + 东方修真；或者“把规则写得更残酷一点”' }),
        h('textarea', { style: { ...S.textarea, minHeight: 260 }, rows: 14, value: text, onChange: (e) => setText(e.target.value), placeholder: '时代、地点、世界运行规则、势力与矛盾、禁忌与代价…' }),
        h('div', { style: { ...S.row, justifyContent: 'space-between' } },
          h('span', { style: S.sub }, `${countChars(text)} 字`),
          h(Btn, { primary: true, disabled: busy, onClick: save }, busy ? '保存中…' : '保存世界观')),
        error ? h('div', { style: S.err }, error) : null,
        h('div', { style: S.divider }),
        h(LocationsSection, {
          book,
          callAi: props.callAi,
          flash: props.flash,
          reload: props.reload,
        }));
    }

    function StyleTab(props) {
      const book = props.book;
      const make = () => ({ ...book.style, charFocus: [...(book.style.charFocus || [])] });
      const [draft, setDraft] = useState(make);
      useEffect(() => { setDraft(make()); }, [book.id, book.updatedAt]);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [aiText, setAiText] = useState('');
      const [aiBusy, setAiBusy] = useState(false);
      const [aiError, setAiError] = useState('');
      const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
      const toggleFocus = (value) => setDraft((d) => {
        const list = Array.isArray(d.charFocus) ? d.charFocus : [];
        return { ...d, charFocus: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] };
      });
      const save = async () => {
        setBusy(true); setError('');
        try { await props.onSave({ style: draft }); props.flash('文风卡已保存'); }
        catch (e) { setError(e.message); } finally { setBusy(false); }
      };
      const runAi = async () => {
        setAiBusy(true); setAiError('');
        try {
          const result = await props.callAi('style', aiText, null);
          if (result.data && typeof result.data === 'object') {
            setDraft((d) => ({ ...d, ...result.data, charFocus: Array.isArray(result.data.charFocus) ? result.data.charFocus : d.charFocus }));
            props.flash('AI 已填入文风方案，确认后保存');
          } else throw new Error('模型没有返回可用的文风 JSON');
        } catch (e) { setAiError(e.message); } finally { setAiBusy(false); }
      };
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { style: S.title }, '写作风格'),
        h(AiBox, { title: 'AI 生成文风方案', value: aiText, onChange: setAiText, busy: aiBusy, error: aiError, onRun: runAi, placeholder: '例如：像老派武侠那样冷、句子短；或者“更贴近现代口语”' }),
        h('div', { style: S.card },
          h(Field, { label: '语言基调' }, h(Select, { value: draft.tone, onChange: (v) => setDraft((d) => ({ ...d, tone: v })), options: TONES })),
          h(Field, { label: '描写重心' }, h(Select, { value: draft.focus, onChange: (v) => setDraft((d) => ({ ...d, focus: v })), options: FOCUS })),
          (draft.focus === 'character' || draft.focus === 'balanced') ? h('div', { style: { marginBottom: 8 } },
            h('span', { style: S.label }, '人物描写侧重（可多选）'),
            h('div', { style: S.wrap }, CHAR_FOCUS.map(([value, label]) => h('button', {
              key: value, type: 'button', onClick: () => toggleFocus(value),
              style: { ...S.chip, borderColor: (draft.charFocus || []).includes(value) ? ACCENT : BORDER, color: (draft.charFocus || []).includes(value) ? ACCENT : 'inherit' },
            }, label)))) : null,
          h(Field, { label: '叙事视角' }, h(Select, { value: draft.person, onChange: (v) => setDraft((d) => ({ ...d, person: v })), options: PERSON })),
          h(Field, { label: '遵循程度', hint: '「完全按要求」时不自行加戏；「自由发挥」只在设定边界内发挥' }, h(Select, { value: draft.adherence, onChange: (v) => setDraft((d) => ({ ...d, adherence: v })), options: ADHERENCE })),
          h(Field, { label: '叙事节奏' }, h(Select, { value: draft.pacing, onChange: (v) => setDraft((d) => ({ ...d, pacing: v })), options: PACING })),
          h(Field, { label: '句长' }, h(Select, { value: draft.sentence, onChange: (v) => setDraft((d) => ({ ...d, sentence: v })), options: SENTENCE })),
          h(Field, { label: '额外文风要求' }, h('textarea', { style: S.textarea, rows: 3, value: draft.custom || '', onChange: set('custom'), placeholder: '例如：少用成语；禁止“眼中闪过一抹…”；对话占比四成' })),
          h(Field, { label: '语感参考段（只学味道，不抄句子）' }, h('textarea', { style: S.textarea, rows: 4, value: draft.sample || '', onChange: set('sample') }))),
        error ? h('div', { style: S.err }, error) : null,
        h(Btn, { primary: true, disabled: busy, onClick: save }, busy ? '保存中…' : '保存文风卡'));
    }

    function ChaptersTab(props) {
      const book = props.book;
      const branches = Array.isArray(book.branches) && book.branches.length > 0
        ? book.branches
        : [{ id: 'main', name: '主线', kind: 'main', timeline: '', description: '' }];
      const [activeBranchId, setActiveBranchId] = useState(branches[0].id);
      const [view, setView] = useState(null);
      const [draft, setDraft] = useState(null);
      const [branchEditing, setBranchEditing] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [branchBusy, setBranchBusy] = useState(false);
      const [branchError, setBranchError] = useState('');
      const [aiText, setAiText] = useState('');
      const [aiBusy, setAiBusy] = useState(false);
      const [aiError, setAiError] = useState('');
      const [notice, setNotice] = useState('');
      const [metaEditing, setMetaEditing] = useState(null);
      const [metaBusy, setMetaBusy] = useState(false);
      const [metaError, setMetaError] = useState('');

      useEffect(() => {
        if (!branches.some((branch) => branch.id === activeBranchId)) {
          setActiveBranchId(branches[0]?.id || 'main');
        }
      }, [book.id, book.updatedAt]);

      const activeBranch = branches.find((branch) => branch.id === activeBranchId) || branches[0];
      const activeChapters = book.chapters
        .filter((ch) => (ch.branchId || 'main') === activeBranch.id)
        .sort((a, b) => (a.seq ?? a.no) - (b.seq ?? b.no));
      const nextSeq = activeChapters.reduce((max, ch) => Math.max(max, ch.seq ?? 0), 0) + 1;
      const nextNo = book.chapters.reduce((max, ch) => Math.max(max, ch.no), 0) + 1;
      const branchName = (id) => branches.find((branch) => branch.id === id)?.name || '主线';
      const existingAt = (no) => book.chapters.find((ch) => ch.no === no);

      const startBranch = (branch) => {
        setBranchEditing(branch
          ? { ...branch }
          : { id: '', name: '', kind: 'if', timeline: '', description: '' });
        setBranchError('');
        setView(null);
        setDraft(null);
      };
      const saveBranch = async () => {
        if (!branchEditing) return;
        if (!branchEditing.name.trim()) { setBranchError('分支名称不能为空'); return; }
        if (!branchEditing.timeline.trim()) { setBranchError('时间线必须单独填写并确定'); return; }
        setBranchBusy(true); setBranchError('');
        try {
          const base = `/books/${encodeURIComponent(book.id)}/branches`;
          const res = branchEditing.id
            ? await apiFetch(`${base}/${encodeURIComponent(branchEditing.id)}`, { method: 'PUT', body: JSON.stringify(branchEditing) })
            : await apiFetch(base, { method: 'POST', body: JSON.stringify(branchEditing) });
          const saved = res.branch;
          setBranchEditing(null);
          await props.reload();
          if (saved?.id) setActiveBranchId(saved.id);
          props.flash('分支已保存');
        } catch (e) { setBranchError(e.message); } finally { setBranchBusy(false); }
      };
      const removeBranch = async () => {
        if (!branchEditing || !branchEditing.id || branchEditing.id === 'main') return;
        if (!window.confirm(`删除分支「${branchEditing.name}」？该分支的章节会迁回主线，关联事实也会改记到主线。`)) return;
        setBranchBusy(true); setBranchError('');
        try {
          await apiFetch(`/books/${encodeURIComponent(book.id)}/branches/${encodeURIComponent(branchEditing.id)}`, { method: 'DELETE' });
          setBranchEditing(null);
          await props.reload();
          setActiveBranchId('main');
          props.flash('分支已删除，章节已迁回主线');
        } catch (e) { setBranchError(e.message); } finally { setBranchBusy(false); }
      };
      const selectBranch = (id) => {
        setActiveBranchId(id);
        setView(null);
        setDraft(null);
        setError('');
        setNotice('');
      };

      const openChapter = async (no) => {
        setError('');
        try {
          const res = await apiFetch(`/books/${encodeURIComponent(book.id)}/chapters/${no}`);
          setView({ ...res.chapter, content: res.content, branchName: branchName(res.chapter.branchId) });
          setDraft(null);
        } catch (e) { setError(e.message); }
      };
      const openBlank = () => {
        setView(null);
        setDraft({
          no: nextNo,
          seq: nextSeq,
          branchId: activeBranch.id,
          timeline: activeBranch.timeline || '',
          title: `第${nextSeq}章`,
          summary: '',
          content: '',
          characters: '',
        });
        setError('');
        setNotice('');
      };
      const saveChapter = async () => {
        if (!draft) return;
        if (!draft.timeline.trim()) { setError('先确定本章时间线'); return; }
        setBusy(true); setError(''); setNotice('');
        try {
          await apiFetch(`/books/${encodeURIComponent(book.id)}/chapters`, {
            method: 'POST',
            body: JSON.stringify({
              no: draft.no,
              seq: draft.seq,
              branch: draft.branchId,
              timeline: draft.timeline,
              title: draft.title,
              summary: draft.summary,
              content: draft.content,
              characters: draft.characters.split(/[,，、\s]+/).filter(Boolean),
              overwrite: Boolean(existingAt(draft.no)),
            }),
          });
          setDraft(null);
          props.flash('章节已保存');
          await props.reload();
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      };
      const runAi = async () => {
        setAiBusy(true); setAiError(''); setError('');
        try {
          const result = await props.callAi('chapter', aiText, null, nextNo, activeBranch.id);
          const text = result.text || '';
          setDraft({
            no: nextNo,
            seq: nextSeq,
            branchId: activeBranch.id,
            timeline: activeBranch.timeline || '',
            title: `第${nextSeq}章`,
            summary: text.replace(/\s+/g, ' ').slice(0, 100) + (text.length > 100 ? '…' : ''),
            content: text,
            characters: '',
          });
          setView(null);
          setNotice('AI 草稿已生成。核对字数、分支时间线与设定后再保存；梗概可自行改得更准。');
        } catch (e) { setAiError(e.message); } finally { setAiBusy(false); }
      };

      const startMetaEdit = () => {
        if (!view) return;
        setMetaEditing({
          branchId: view.branchId || activeBranch.id,
          seq: String(view.seq ?? 1),
          timeline: view.timeline || '',
          title: view.title || '',
          summary: view.summary || '',
          characters: (view.characters || []).join('，'),
        });
        setMetaError('');
      };
      const saveMeta = async () => {
        if (!metaEditing || !view) return;
        if (!metaEditing.timeline.trim()) { setMetaError('时间线不能为空'); return; }
        setMetaBusy(true); setMetaError('');
        try {
          const res = await apiFetch(`/books/${encodeURIComponent(book.id)}/chapters/${view.no}`, {
            method: 'PATCH',
            body: JSON.stringify({
              branch: metaEditing.branchId,
              seq: Number(metaEditing.seq),
              timeline: metaEditing.timeline,
              title: metaEditing.title,
              summary: metaEditing.summary,
              characters: metaEditing.characters.split(/[,，、\s]+/).filter(Boolean),
            }),
          });
          setView((current) => current ? {
            ...current,
            ...res.chapter,
            branchName: branchName(res.chapter.branchId),
          } : current);
          setMetaEditing(null);
          await props.reload();
          props.flash('章节关系/信息已更新');
        } catch (e) { setMetaError(e.message); } finally { setMetaBusy(false); }
      };

      if (branchEditing) {
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('div', { style: S.title }, branchEditing.id ? '编辑分支' : '新增分支'),
            h(Btn, { small: true, onClick: () => setBranchEditing(null) }, '返回章节')),
          h('div', { style: { ...S.card, ...S.sub } }, '分支决定这一章属于哪条故事线；时间线必须单独填清楚（例如「正传第 3 章之后」「三年前的冬天」）。'),
          h(Field, { label: '分支名称' }, h('input', { style: S.input, value: branchEditing.name, onChange: (e) => setBranchEditing((d) => ({ ...d, name: e.target.value })), placeholder: '主线 / if线 / 前传 / 后传…' })),
          h(Field, { label: '分支类型' },
            h(Select, {
              value: branchEditing.kind || 'other',
              onChange: (v) => setBranchEditing((d) => ({ ...d, kind: v })),
              options: BRANCH_KINDS,
            })),
          h(Field, { label: '时间线（必填，写章前锁定）' },
            h('textarea', {
              style: S.textarea, rows: 2,
              value: branchEditing.timeline,
              onChange: (e) => setBranchEditing((d) => ({ ...d, timeline: e.target.value })),
              placeholder: '例如：正传第 1–12 章之间，主角尚未知道真相；或「三年前的冬天，北境」',
            })),
          h(Field, { label: '说明' }, h('textarea', { style: S.textarea, rows: 2, value: branchEditing.description, onChange: (e) => setBranchEditing((d) => ({ ...d, description: e.target.value })), placeholder: '这条分支与主线的关系、从哪一段分叉' })),
          branchError ? h('div', { style: S.err }, branchError) : null,
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            (branchEditing.id && branchEditing.id !== 'main')
              ? h(Btn, { small: true, danger: true, disabled: branchBusy, onClick: removeBranch }, '删除分支')
              : h('span'),
            h('div', { style: S.wrap },
              h(Btn, { onClick: () => setBranchEditing(null) }, '取消'),
              h(Btn, { primary: true, disabled: branchBusy, onClick: saveBranch }, branchBusy ? '保存中…' : '保存分支'))));
      }

      if (metaEditing) {
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('div', { style: S.title }, `编辑章节关系 · ${view?.title || ''}`),
            h(Btn, { small: true, onClick: () => setMetaEditing(null) }, '返回正文')),
          h('div', { style: { ...S.card, ...S.sub } }, '改分支或章序会自动顺延相邻章节；只改关系与元信息，不改正文。'),
          h(Field, { label: '所属分支' },
            h(Select, {
              value: metaEditing.branchId,
              onChange: (v) => setMetaEditing((d) => ({ ...d, branchId: v })),
              options: branches.map((branch) => [branch.id, `${branch.name}（${branch.timeline || '未填写时间线'}）`]),
            })),
          h(Field, { label: '分支内章序' },
            h('input', {
              style: S.input, value: metaEditing.seq, inputMode: 'numeric',
              onChange: (e) => setMetaEditing((d) => ({ ...d, seq: e.target.value })),
            })),
          h(Field, { label: '本章时间线' },
            h('input', {
              style: S.input, value: metaEditing.timeline,
              onChange: (e) => setMetaEditing((d) => ({ ...d, timeline: e.target.value })),
            })),
          h(Field, { label: '标题' }, h('input', { style: S.input, value: metaEditing.title, onChange: (e) => setMetaEditing((d) => ({ ...d, title: e.target.value })) })),
          h(Field, { label: '梗概' }, h('textarea', { style: { ...S.textarea, rows: 3 }, value: metaEditing.summary, onChange: (e) => setMetaEditing((d) => ({ ...d, summary: e.target.value })) })),
          h(Field, { label: '出场人物（逗号分隔）' }, h('input', { style: S.input, value: metaEditing.characters, onChange: (e) => setMetaEditing((d) => ({ ...d, characters: e.target.value })) })),
          metaError ? h('div', { style: S.err }, metaError) : null,
          h('div', { style: { ...S.row, justifyContent: 'flex-end' } },
            h(Btn, { onClick: () => setMetaEditing(null) }, '取消'),
            h(Btn, { primary: true, disabled: metaBusy, onClick: saveMeta }, metaBusy ? '保存中…' : '保存修改')));
      }

      if (view) {
        const removeViewChapter = async () => {
          if (!window.confirm(`删除「${view.branchName}」第${view.seq}章？正文文件会被移除，此操作不可撤销。`)) return;
          try {
            await apiFetch(`/books/${encodeURIComponent(book.id)}/chapters/${view.no}`, { method: 'DELETE' });
            setView(null);
            props.flash('章节已删除');
            await props.reload();
          } catch (e) { setError(e.message); }
        };
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('div', { style: { ...S.title, fontSize: 14 } }, `${view.branchName} · 第${view.seq}章 · ${view.title}`),
            h('div', { style: S.wrap },
              h(Btn, { small: true, onClick: startMetaEdit }, '编辑关系'),
              h(Btn, { small: true, danger: true, onClick: removeViewChapter }, '删除'),
              h(Btn, { small: true, onClick: () => setView(null) }, '返回目录'))),
          h('div', { style: S.sub }, `${countChars(view.content)} 字 · 时间线：${view.timeline || '未填写'}`),
          h('div', { style: { ...S.card, whiteSpace: 'pre-wrap', maxHeight: 460, overflowY: 'auto', fontSize: 12.5 } }, view.content),
          error ? h('div', { style: S.err }, error) : null);
      }

      if (draft) {
        const words = countChars(draft.content);
        const inRange = words >= book.chars.min && words <= book.chars.max;
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('div', { style: S.title }, `${branchName(draft.branchId)} · 第${draft.seq}章`),
            h(Btn, { small: true, onClick: () => setDraft(null) }, '放弃草稿')),
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('span', { style: S.sub }, `本次 ${words} 字 / 区间 ${book.chars.min}–${book.chars.max}（目标 ${book.chars.target}）`),
            h('span', { style: { fontSize: 11.5, color: inRange ? '#3fb950' : '#d19a66' } }, inRange ? '字数达标' : (words < book.chars.min ? `还差 ${book.chars.min - words} 字` : `超出 ${words - book.chars.max} 字`))),
          h(Field, { label: '本章时间线（必填，默认继承分支）' },
            h('input', {
              style: S.input,
              value: draft.timeline,
              onChange: (e) => setDraft((d) => ({ ...d, timeline: e.target.value })),
              placeholder: '例如：正传第 5 章之后 / 三年前的冬夜',
            })),
          h(Field, { label: '标题' }, h('input', { style: S.input, value: draft.title, onChange: (e) => setDraft((d) => ({ ...d, title: e.target.value })) })),
          h(Field, { label: '本章梗概（必填，1–3 句）' }, h('textarea', { style: { ...S.textarea, rows: 2 }, value: draft.summary, onChange: (e) => setDraft((d) => ({ ...d, summary: e.target.value })) })),
          h(Field, { label: '出场人物（逗号分隔）' }, h('input', { style: S.input, value: draft.characters, onChange: (e) => setDraft((d) => ({ ...d, characters: e.target.value })) })),
          h('textarea', { style: { ...S.textarea, minHeight: 320, fontSize: 13 }, rows: 18, value: draft.content, onChange: (e) => setDraft((d) => ({ ...d, content: e.target.value })) }),
          error ? h('div', { style: S.err }, error) : null,
          notice ? h('div', { style: S.notice }, notice) : null,
          h('div', { style: { ...S.row, justifyContent: 'flex-end' } },
            h(Btn, { disabled: busy || !inRange || !draft.timeline.trim(), primary: true, onClick: saveChapter }, busy ? '保存中…' : '保存本章')));
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { style: { ...S.row, justifyContent: 'space-between' } },
          h('div', { style: S.title }, '章节'),
          h('div', { style: S.wrap },
            h(Btn, { small: true, onClick: () => startBranch(null) }, '＋ 分支'),
            h(Btn, { small: true, onClick: () => startBranch(activeBranch) }, '分支设置'))),
        h('div', { style: { ...S.wrap, marginBottom: 2 } },
          branches.map((branch) => h('button', {
            key: branch.id, type: 'button', onClick: () => selectBranch(branch.id),
            style: {
              ...S.chip,
              borderColor: branch.id === activeBranch.id ? ACCENT : BORDER,
              color: branch.id === activeBranch.id ? ACCENT : 'inherit',
              fontWeight: branch.id === activeBranch.id ? 600 : 400,
            },
          }, `${branch.name} · ${book.chapters.filter((ch) => (ch.branchId || 'main') === branch.id).length}`))),
        h('div', { style: { ...S.card, display: 'flex', flexDirection: 'column', gap: 3 } },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('span', { style: { fontWeight: 600 } }, `${activeBranch.name}（${(BRANCH_KINDS.find(([k]) => k === activeBranch.kind) || [null, activeBranch.kind || '其他'])[1]}）`),
            h('span', { style: S.sub }, `${activeChapters.length} 章`)),
          h('div', { style: { ...S.sub } }, `时间线：${activeBranch.timeline || '（未填写，写章前必须先设置）'}`),
          activeBranch.description ? h('div', { style: S.muted }, activeBranch.description) : null),
        h('div', { style: { ...S.row, justifyContent: 'space-between' } },
          h('div', { style: S.wrap },
            h(Btn, { small: true, onClick: openBlank }, `写${activeBranch.name}第${nextSeq}章`),
            h(Btn, { small: true, primary: true, disabled: aiBusy, onClick: runAi }, aiBusy ? 'AI 起草中…' : `AI 起草第${nextSeq}章`))),
        h('div', { style: { ...S.card, display: 'flex', flexDirection: 'column', gap: 6 } },
          h('div', { style: S.sub }, `动笔前先定字数与时间线：本章目标 ${book.chars.target} 字（${book.chars.min}–${book.chars.max}），当前分支时间线「${activeBranch.timeline || '未填写'}」。AI 起草会按这个区间写。`),
          h('textarea', { style: S.textarea, rows: 2, value: aiText, onChange: (e) => setAiText(e.target.value), placeholder: '给 AI 的本章额外要求（可留空）：这一章要发生什么、从谁的视角、结尾留什么钩子' }),
          aiError ? h('div', { style: S.err }, aiError) : null,
          h('div', { style: S.muted }, 'AI 起草只生成一章草稿，不会自动落盘；字数或时间线不完整时保存按钮会被禁用。')),
        error ? h('div', { style: S.err }, error) : null,
        activeChapters.length === 0 ? h('div', { style: { ...S.card, ...S.muted } }, `「${activeBranch.name}」还没有正文。点上面的按钮写第${nextSeq}章。`) : null,
        activeChapters.slice().reverse().map((c) => h('button', {
          key: c.no, type: 'button', onClick: () => openChapter(c.no),
          style: {
            ...S.card, textAlign: 'left', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', gap: 2, width: '100%',
          },
        },
        h('div', { style: { ...S.row, justifyContent: 'space-between' } },
          h('span', { style: { fontWeight: 600 } }, `第${c.seq ?? c.no}章 ${c.title}`),
          h('span', { style: S.sub }, `${c.words} 字`)),
        h('div', { style: { ...S.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, `时间线：${c.timeline || activeBranch.timeline || '未填写'}`),
        h('div', { style: { ...S.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, c.summary))));
    }

    function WriterPanel(props) {
      const sessionId = props?.sessionId ?? null;
      const [snap, setSnap] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [tab, setTab] = useState('book');
      const [creating, setCreating] = useState(false);
      const [modeBusy, setModeBusy] = useState(false);
      const noticeTimer = useRef(null);

      const flash = (msg) => {
        setNotice(String(msg || ''));
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(''), 5000);
      };

      const reload = async () => {
        try {
          const q = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
          const data = await apiFetch(`/state${q}`);
          setSnap(data);
          setError('');
        } catch (e) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => { setLoading(true); reload(); }, [sessionId]);
      useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

      const book = snap?.book ?? null;
      const books = snap?.books ?? [];
      const session = snap?.session ?? null;

      const callAi = async (kind, instruction, target, chapter, branch) => {
        const result = await apiFetch('/ai', {
          method: 'POST',
          body: JSON.stringify({
            sessionId, bookId: book?.id, kind, instruction: instruction || '',
            target: target || null, chapter: chapter || null, branch: branch || null,
          }),
        });
        return result;
      };

      const saveBook = async (patch) => {
        const result = await apiFetch(`/books/${encodeURIComponent(book.id)}`, {
          method: 'PUT', body: JSON.stringify(patch),
        });
        await reload();
        return result;
      };

      const createBook = async (payload) => {
        await apiFetch('/books', { method: 'POST', body: JSON.stringify(payload) });
        setCreating(false);
        await reload();
        flash('作品已创建，去「角色」「世界观」「文风」补设定');
      };

      const deleteBook = async () => {
        try {
          await apiFetch(`/books/${encodeURIComponent(book.id)}`, { method: 'DELETE' });
          await reload();
          flash('作品已删除');
        } catch (e) { setError(e.message); }
      };

      const saveCharacter = async (character) => {
        const base = `/books/${encodeURIComponent(book.id)}/characters`;
        if (character.id) {
          await apiFetch(`${base}/${encodeURIComponent(character.id)}`, { method: 'PUT', body: JSON.stringify(character) });
        } else {
          await apiFetch(base, { method: 'POST', body: JSON.stringify(character) });
        }
        await reload();
      };

      const deleteCharacter = async (id) => {
        await apiFetch(`/books/${encodeURIComponent(book.id)}/characters/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await reload();
      };

      const selectBook = async (id) => {
        try {
          if (sessionId) {
            await apiFetch('/session', { method: 'POST', body: JSON.stringify({ sessionId, bookId: id }) });
          } else {
            await apiFetch(`/books/${encodeURIComponent(id)}/activate`, { method: 'POST', body: '{}' });
          }
          await reload();
        } catch (e) { setError(e.message); }
      };

      const enableMode = async () => {
        if (!sessionId) { flash('当前不在会话里，无法开启写作模式'); return; }
        setModeBusy(true);
        try {
          await apiFetch('/session', { method: 'POST', body: JSON.stringify({ sessionId, bookId: book?.id, mode: true }) });
          try { await navigator.clipboard.writeText('开启写作模式'); } catch { /* 剪贴板失败不阻断 */ }
          await reload();
          flash('已标记本对话为写作模式，并复制了「开启写作模式」——粘贴发送即可让 AI 接管。');
        } catch (e) { flash(e.message); } finally { setModeBusy(false); }
      };

      const disableMode = async () => {
        if (!sessionId) return;
        setModeBusy(true);
        try {
          await apiFetch('/session', { method: 'POST', body: JSON.stringify({ sessionId, mode: false }) });
          await reload();
          flash('本对话已退出写作模式（作品数据不受影响）');
        } catch (e) { flash(e.message); } finally { setModeBusy(false); }
      };

      if (loading) return h('div', { style: { ...S.root, ...S.muted } }, '写作台载入中…');
      if (error && !snap) {
        return h('div', { style: { ...S.root } },
          h('div', { style: S.err }, error),
          h(Btn, { onClick: reload }, '重试'));
      }

      return h('div', { style: S.root },
        h('div', null,
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('div', { style: { ...S.row, gap: 6 } },
              h('img', { src: ICON_URI, alt: '写作台', width: 20, height: 20, style: { borderRadius: 5, flex: 'none' } }),
              h('span', { style: S.title }, '写作台'),
              h('span', { style: S.badge }, `v${VERSION}`)),
            h(Btn, { small: true, onClick: reload }, '刷新')),
          h('div', { style: { ...S.sub, marginTop: 2 } }, '设定、正文、上下文包都落盘——写长篇不靠记忆。')),

        books.length > 0 ? h('div', { style: { ...S.row, justifyContent: 'space-between' } },
          h('select', {
            value: book?.id || '', onChange: (e) => selectBook(e.target.value),
            style: { ...S.input, flex: '1 1 auto', cursor: 'pointer' },
          }, books.map((b) => h('option', { key: b.id, value: b.id }, `${b.title} · ${b.chapters}章`))),
          h(Btn, { small: true, onClick: () => setCreating((v) => !v) }, creating ? '取消' : '＋ 新建')) : null,

        h('div', { style: { ...S.card, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 } },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('span', { style: { fontSize: 12 } },
              session?.mode ? h('span', { style: { color: '#3fb950' } }, '● 本对话写作模式已开启') : h('span', { style: S.muted }, '○ 本对话尚未开启写作模式')),
            session?.mode
              ? h(Btn, { small: true, disabled: modeBusy, onClick: disableMode }, '关闭')
              : h(Btn, { small: true, primary: true, disabled: modeBusy, onClick: enableMode }, modeBusy ? '…' : '开启')),
          book ? h('div', { style: { ...S.sub } }, `本章目标 ${book.chars.target} 字（${book.chars.min}–${book.chars.max}）· ${book.chapters.length} 章 · ${(book.branches || []).length} 分支 · ${book.characters.length} 个角色 · ${(book.locations || []).length} 处地点`) : null,
          session?.mode ? null : h('div', { style: { ...S.sub } }, '点「开启」后发送「开启写作模式」，AI 会先加载上下文再动笔。')),

        notice ? h('div', { style: S.notice }, notice) : null,
        error ? h('div', { style: S.err }, error) : null,

        creating || books.length === 0 ? h(CreateBook, { onCreate: createBook }) : null,

        (book && !creating) ? h('div', null,
          h('div', { style: { ...S.row, gap: 4, marginBottom: 8 } },
            [['book', '书籍'], ['chars', '角色'], ['world', '世界观'], ['style', '文风'], ['chapters', '章节']].map(([key, label]) =>
              h('button', { key, type: 'button', onClick: () => setTab(key), style: S.tab(tab === key) }, label))),

          tab === 'book' ? h(BookTab, { book, onSave: saveBook, onDelete: deleteBook, callAi, flash }) : null,
          tab === 'chars' ? h(CharactersTab, { book, onSaveCharacter: saveCharacter, onDeleteCharacter: deleteCharacter, callAi, flash }) : null,
          tab === 'world' ? h(WorldTab, { book, onSave: saveBook, callAi, flash, reload }) : null,
          tab === 'style' ? h(StyleTab, { book, onSave: saveBook, callAi, flash }) : null,
          tab === 'chapters' ? h(ChaptersTab, { book, callAi, flash, reload }) : null) : null);
    }

    function apply(ctx) {
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: () => '写作台',
        guide: [{
          order: 92,
          title: () => '写作台',
          description: () => '书名、角色、世界观、文风、字数与章节——写长篇的设定面板',
        }],
      }), 'dsh-writer-studio: 右侧栏 tab 类型');

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        inject: (sessionId) => ({ sessionId }),
      }, WriterPanel)), 'dsh-writer-studio: 右侧栏 tab 内容');

      if (typeof window !== 'undefined') {
        window.__writerStudio = {
          version: VERSION,
          open: () => ctx.sidebarRight.openTab(TAB_KIND),
        };
      }
    }

    module.exports = { apply, inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'sessions'] };
    return module.exports;
  },
});
