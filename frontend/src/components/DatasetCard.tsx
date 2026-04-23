import { type Dataset } from '../types/dataset'
import { Play } from 'lucide-react'

type Props = {
  dataset: Dataset
}

export default function DatasetCard({ dataset }: Props) {
  return (
    <div className="flex items-center gap-[16px] p-[12px] self-stretch bg-white rounded-[24px]">
      <img
        src={dataset.imageUrl}
        className={`h-[128px] w-[204px] object-cover rounded-[12px] ${
          dataset.completed ? 'opacity-70' : ''
        }`}
      />

      <div className={`flex flex-col justify-between flex-1 self-stretch ${
        dataset.completed ? 'opacity-70' : ''
      }`}> 
        <div className="flex flex-col gap-[8px]">
          <h2 className="text-[20px] leading-[24px]">{dataset.title}</h2>
          <p className="text-[16px] leading-[19px] whitespace-pre-line">{dataset.description}</p>
        </div>

        <div className="flex items-end justify-between w-full">
          <div className="flex gap-[4px]">
            {dataset.tags.map((tag, i) => (
              <span
                key={i}
                className="px-[4px] py-[2px] text-[16px] leading-[19px] rounded-[4px] bg-[${tag.color}]/20"
                style={{ 
                  backgroundColor: `${tag.color}33`
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
          <button className="p-[8px] flex items-center justify-center bg-[#f5f5f5] rounded-lg">
            <Play size={32} strokeWidth={1.5} />
          </button>
        </div>
      </div>      
    </div>
  )
}