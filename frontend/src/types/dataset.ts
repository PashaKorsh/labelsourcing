import { type Tag } from './tag'

export type Dataset = {
  id: number
  title: string
  description: string
  tags: Tag[]
  imageUrl: string
  completed?: boolean
}
