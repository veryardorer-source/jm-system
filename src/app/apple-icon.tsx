import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{
        width: 180, height: 180,
        background: '#2563eb',
        borderRadius: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 80,
        fontWeight: 'bold',
        fontFamily: 'Arial',
      }}>
        JM
      </div>
    ),
    { width: 180, height: 180 }
  )
}
