<!-- Cookie Consent Pop-up -->
<div id="cookie-consent" class="cookie-consent">
  <div class="cookie-content">
    <h2>Cookie Notice</h2>
    <p>We use cookies to enhance your browsing experience. By continuing to use our site, you agree to our <a href="/privacy">Cookie Policy</a>.</p>
    <div class="cookie-buttons">
      <button id="accept-cookies">Accept</button>
      <button id="decline-cookies">Decline</button>
    </div>
  </div>
</div>

<style>
.cookie-consent {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.cookie-consent.show {
  visibility: visible;
  opacity: 1;
}

.cookie-content {
  background-color: #ffffff;
  padding: 2rem;
  border-radius: 8px;
  text-align: center;
  max-width: 500px;
  width: 90%;
}

.cookie-content h2 {
  margin-top: 0;
  font-size: 1.5rem;
  color: #333;
}

.cookie-content p {
  margin: 1rem 0;
  font-size: 1rem;
  color: #555;
}

.cookie-buttons {
  margin-top: 1.5rem;
}

.cookie-buttons button {
  padding: 0.6rem 1.2rem;
  margin: 0 0.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

#accept-cookies {
  background-color: #4CAF50;
  color: white;
}

#decline-cookies {
  background-color: #f44336;
  color: white;
}

.cookie-content a {
  color: #1a0dab;
  text-decoration: underline;
}
</style>

<script>
document.addEventListener("DOMContentLoaded", function () {
  const cookieConsent = document.getElementById("cookie-consent");
  const acceptButton = document.getElementById("accept-cookies");
  const declineButton = document.getElementById("decline-cookies");

  // Check if cookie consent has already been given
  function hasAcceptedCookies() {
    return document.cookie.split(";").some(item => item.trim().startsWith("cookieConsent=accepted"));
  }

  // Show the cookie consent pop-up if not already accepted
  if (!hasAcceptedCookies()) {
    cookieConsent.classList.add("show");
  }

  // Handle accept button click
  acceptButton.addEventListener("click", () => {
    document.cookie = "cookieConsent=accepted; max-age=31536000; path=/";
    cookieConsent.classList.remove("show");
  });

  // Handle decline button click
  declineButton.addEventListener("click", () => {
    document.cookie = "cookieConsent=declined; max-age=31536000; path=/";
    cookieConsent.classList.remove("show");
  });
});
</script>