(() => {
  const STYLE_ID = 'nh-dev-credit-style';
  const CREDIT_CLASS = 'nh-dev-credit';
  const LINK = 'https://www.linkedin.com/in/devcarloslima/';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .nh-dev-credit {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 12px 10px;
        margin-top: 26px;
        text-align: center;
        font-size: 11px;
        font-weight: 400;
        line-height: 1.35;
        letter-spacing: .01em;
        opacity: .56;
        color: inherit;
      }
      .nh-dev-credit a {
        color: inherit;
        text-decoration: none;
        font-weight: 500;
      }
      .nh-dev-credit a:hover,
      .nh-dev-credit a:focus-visible {
        text-decoration: underline;
        opacity: .95;
      }
      @media (max-width: 640px) {
        .nh-dev-credit {
          padding: 7px 10px 9px;
          margin-top: 20px;
          font-size: 10px;
          opacity: .52;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureCredit() {
    ensureStyle();
    if (document.querySelector(`.${CREDIT_CLASS}`)) return;
    const credit = document.createElement('div');
    credit.className = CREDIT_CLASS;
    credit.setAttribute('aria-label', 'Crédito de desenvolvimento');
    credit.innerHTML = `@desenvolvido por <a href="${LINK}" target="_blank" rel="noopener noreferrer">Carlos Lima</a>`;
    const footer = document.querySelector('footer');
    if (footer) footer.appendChild(credit);
    else document.body.appendChild(credit);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureCredit, { once: true });
  else ensureCredit();
})();
