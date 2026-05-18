import L from 'leaflet';

export function createPhotoPinIcon(photoUri?: string): L.DivIcon {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';

  if (photoUri) {
    const frame = document.createElement('div');
    frame.style.width = '48px';
    frame.style.height = '48px';
    frame.style.overflow = 'hidden';
    frame.style.borderRadius = '16px';
    frame.style.border = '3px solid #ffffff';
    frame.style.background = '#ffffff';
    frame.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.28)';

    const image = document.createElement('img');
    image.src = photoUri;
    image.alt = '';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'cover';
    frame.appendChild(image);

    const notch = document.createElement('div');
    notch.style.width = '0';
    notch.style.height = '0';
    notch.style.marginTop = '-1px';
    notch.style.borderLeft = '8px solid transparent';
    notch.style.borderRight = '8px solid transparent';
    notch.style.borderTop = '12px solid #ffffff';
    notch.style.filter = 'drop-shadow(0 8px 12px rgba(15, 23, 42, 0.24))';

    wrapper.appendChild(frame);
    wrapper.appendChild(notch);
  } else {
    const frame = document.createElement('div');
    frame.style.width = '48px';
    frame.style.height = '48px';
    frame.style.overflow = 'hidden';
    frame.style.borderRadius = '16px';
    frame.style.border = '3px solid #ffffff';
    frame.style.background = '#e2e8f0';
    frame.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.28)';
    frame.style.display = 'flex';
    frame.style.alignItems = 'center';
    frame.style.justifyContent = 'center';

    const question = document.createElement('span');
    question.textContent = '?';
    question.style.fontSize = '22px';
    question.style.fontWeight = '700';
    question.style.color = '#94a3b8';
    question.style.lineHeight = '1';
    frame.appendChild(question);

    const notch = document.createElement('div');
    notch.style.width = '0';
    notch.style.height = '0';
    notch.style.marginTop = '-1px';
    notch.style.borderLeft = '8px solid transparent';
    notch.style.borderRight = '8px solid transparent';
    notch.style.borderTop = '12px solid #ffffff';
    notch.style.filter = 'drop-shadow(0 8px 12px rgba(15, 23, 42, 0.24))';

    wrapper.appendChild(frame);
    wrapper.appendChild(notch);
  }

  return L.divIcon({
    className: '',
    html: wrapper,
    iconSize: [54, 64],
    iconAnchor: [27, 60],
  });
}
