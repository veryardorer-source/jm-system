import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{
        width: 512, height: 512,
        background: '#2563eb',
        borderRadius: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 220,
        fontWeight: 'bold',
        fontFamily: 'Arial',
      }}>
        JM
      </div>
    ),
    { width: 512, height: 512 }
  )
}
