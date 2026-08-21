"use client"

import { useEffect, useState } from "react"

export default function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false)
  const [showNotifyPrompt, setShowNotifyPrompt] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const accepted = localStorage.getItem("cookiesAccepted")
      if (accepted !== "true") setShowBanner(true)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem("cookiesAccepted", "true")
    setShowBanner(false)
    setShowNotifyPrompt(true)
  }

  const handleDecline = () => {
    localStorage.setItem("cookiesAccepted", "false")
    setShowBanner(false)
  }

  const handleNotifyYes = () => {
    localStorage.setItem("receiveNotifications", "true")
    setShowNotifyPrompt(false)
  }

  const handleNotifyNo = () => {
    localStorage.removeItem("receiveNotifications")
    setShowNotifyPrompt(false)
  }

  if (!showBanner && !showNotifyPrompt) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[1000]">
      <div className="bg-white p-6 rounded shadow-md w-11/12 md:w-1/2">
        {showBanner && (
          <>
            <h5 className="font-semibold mb-3">
              We gebruiken cookies om uw ervaring te verbeteren.
            </h5>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleAccept}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                Ja
              </button>
              <button
                onClick={handleDecline}
                className="px-4 py-2 bg-gray-300 rounded"
              >
                Nee
              </button>
            </div>
          </>
        )}
        {showNotifyPrompt && (
          <>
            <h5 className="font-semibold mb-3">
              Wilt u graag e‑mailmeldingen ontvangen voor nieuwe producten,
              kleuren of kortingscodes?
            </h5>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleNotifyYes}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                Ja
              </button>
              <button
                onClick={handleNotifyNo}
                className="px-4 py-2 bg-gray-300 rounded"
              >
                Nee
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}