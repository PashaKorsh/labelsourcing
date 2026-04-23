interface PageHeaderProps {
  title: string;
  avatarUrl: string;
}

export function PageHeader({ title, avatarUrl }: PageHeaderProps) {
  return ( // TODO : вынести кнопку хедера в отдельный компонент
      <nav className="flex items-center gap-[2px] rounded-3xl bg-white p-[4px] w-fit">
        <div className="bg-[#f5f5f5] px-[16px] py-[8px] rounded-[20px]">
          <span className="text-[20px] leading-none">{title}</span>
        </div>
        <div className="flex items-center justify-center h-[40px] w-[40px] rounded-[20px] hover:ring-2 hover:ring-black transition-all">
          <img
            src={avatarUrl}
            alt="Avatar"
            className="h-[36px] w-[36px] rounded-full object-cover"
          />
        </div>
      </nav>
  );
}
