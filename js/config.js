/**
 * 배포 설정
 *
 * 1) Google Apps Script를 웹앱으로 배포한 뒤 발급받은 URL을
 *    아래 APPS_SCRIPT_URL 에 붙여넣으세요. (자세한 절차는 SETUP.md)
 * 2) URL을 넣기 전까지는 MOCK_MODE 가 자동으로 켜져서
 *    js/mock-data.js 의 샘플 데이터로 화면을 미리 볼 수 있습니다.
 */
const APP_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxhkBaPBftHOvyUffjlFtvmP1seEDmfm3dIfKfyrhFJhKH36eVCj--6eyKteZCDpQjL/exec',

  get MOCK_MODE() {
    return !this.APPS_SCRIPT_URL;
  },

  // 주관별 기본 색상 (Nord 팔레트). 관리자 페이지에서 일정별로 재정의 가능.
  ORG_COLORS: {
    '중등교육': '#5e81ac', // nord10
    '직업교육': '#a3be8c', // nord14
    '중등인사': '#d08770', // nord12
    '진로진학': '#b48ead', // nord15
    '__default': '#4c566a' // nord3
  },

  getOrgColor(org) {
    return this.ORG_COLORS[org] || this.ORG_COLORS['__default'];
  }
};
