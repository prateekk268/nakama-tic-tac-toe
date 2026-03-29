import { useContext } from 'react'
import { NakamaContext } from '../context/NakamaProvider.jsx'

export function useNakama() {
  const context = useContext(NakamaContext)

  if (!context) {
    throw new Error('useNakama must be used inside NakamaProvider.')
  }

  return context
}
