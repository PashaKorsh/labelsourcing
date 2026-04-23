export function SearchBar() {
  return (
    <input
      type="text"
      placeholder="Поиск"
      className="h-[48px] w-full rounded-[24px] bg-white px-[20px] py-[12px] text-[20px] placeholder:text-[#6f6f6f]"
      style={{ lineHeight: '1' }}
    />
  );
}
