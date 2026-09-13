const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');

navToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', isOpen);
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

contactForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const grade = document.getElementById('grade');
  const message = document.getElementById('message').value.trim();

  const gradeText = grade.options[grade.selectedIndex].text;
  const whatsappMessage = encodeURIComponent(
    `Merhaba Hoca Namık,\n\nAd Soyad: ${name}\nTelefon: ${phone}\nSınıf/Hedef: ${gradeText}\n\nMesaj: ${message || 'Özel ders hakkında bilgi almak istiyorum.'}`
  );

  window.open(`https://wa.me/905551234567?text=${whatsappMessage}`, '_blank');

  formNote.textContent = 'Mesajınız WhatsApp üzerinden gönderilmek üzere hazırlandı!';
  formNote.classList.add('success');
  contactForm.reset();

  setTimeout(() => {
    formNote.textContent = '';
    formNote.classList.remove('success');
  }, 5000);
});
