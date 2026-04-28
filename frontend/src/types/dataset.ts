import { type Role } from './role'

export type Dataset = {
  id: number
  title: string
  description: string
  tags: Role[]
  imageUrl: string
  completed?: boolean
}
