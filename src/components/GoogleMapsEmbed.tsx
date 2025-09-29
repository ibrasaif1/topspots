'use client'

interface GoogleMapsEmbedProps {
  query?: string
  location?: string
}

export default function GoogleMapsEmbed({ 
  query = "restaurants near me", 
  location = "New York, NY" 
}: GoogleMapsEmbedProps) {
  const embedUrl = `https://www.google.com/maps/embed/v1/search?key=YOUR_GOOGLE_MAPS_API_KEY&q=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden shadow-lg">
      <iframe
        src={embedUrl}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="rounded-lg"
      />
    </div>
  )
}