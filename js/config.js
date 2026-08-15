/**
 * 배포 설정
 *
 * 1) Google Apps Script를 웹앱으로 배포한 뒤 발급받은 URL을
 *    아래 APPS_SCRIPT_URL 에 붙여넣으세요. (자세한 절차는 SETUP.md)
 * 2) URL을 넣기 전까지는 MOCK_MODE 가 자동으로 켜져서
 *    js/mock-data.js 의 샘플 데이터로 화면을 미리 볼 수 있습니다.
 *
 * 캘린더 제목/연도, 주관 순서/색상, 비공개 일정 색상은 관리자페이지에서 변경 가능하며
 * 서버(Config 탭)에 저장됩니다. 아래 값들은 서버 값이 오기 전까지 쓰이는 초기값(=최초
 * 배포 시 기본값)입니다. Api.list() 응답의 orgConfig/siteConfig로 apply*Config()를
 * 호출하면 실제 값으로 갱신됩니다.
 */
const APP_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxhkBaPBftHOvyUffjlFtvmP1seEDmfm3dIfKfyrhFJhKH36eVCj--6eyKteZCDpQjL/exec',

  get MOCK_MODE() {
    return !this.APPS_SCRIPT_URL;
  },

  SITE_TITLE: '중등교육 캘린더',
  SITE_YEAR: '2026',

  ORG_ORDER: ['중등교육', '진로진학', '직업교육', '중등인사'],

  // 주관별 기본 색상 (부서 구분이 뚜렷하도록 채도 높은 팔레트).
  ORG_COLORS: {
    '중등교육': '#3B82F6', // blue
    '진로진학': '#A855F7', // purple
    '직업교육': '#10B981', // green
    '중등인사': '#F59E0B', // amber
    '__default': '#64748B' // slate
  },

  // 비공개 일정 기본 색상 (붉은색 계열)
  PRIVATE_COLOR: '#E11D48',

  getOrgColor(org) {
    return this.ORG_COLORS[org] || this.ORG_COLORS['__default'];
  },

  // Api.list()가 돌려주는 orgConfig({order, colors, privateColor})를 반영한다.
  applyOrgConfig(cfg) {
    if (!cfg) return;
    if (cfg.order && cfg.order.length) this.ORG_ORDER = cfg.order.slice();
    if (cfg.colors) this.ORG_COLORS = Object.assign({}, this.ORG_COLORS, cfg.colors);
    if (cfg.privateColor) this.PRIVATE_COLOR = cfg.privateColor;
    document.documentElement.style.setProperty('--private-color', this.PRIVATE_COLOR);
  },

  // Api.list()가 돌려주는 siteConfig({title, year})를 반영한다.
  applySiteConfig(cfg) {
    if (!cfg) return;
    if (cfg.title) this.SITE_TITLE = cfg.title;
    if (cfg.year) this.SITE_YEAR = cfg.year;
  },

  hexToRgba(hex, alpha) {
    const h = String(hex || '').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  },

  // 비공개 일정 칩 스타일(연한 배경 + 글자색, 빗금 없음). 자물쇠 아이콘은 별도 표시.
  privateChipStyle() {
    const pc = this.PRIVATE_COLOR;
    return 'background-color:' + this.hexToRgba(pc, 0.16) + ';color:' + pc + ';';
  }
};
