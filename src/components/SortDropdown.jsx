export default function SortDropdown({ sortOption, setSortOption }) {
  return (
    <div className="quote-sort-bar">
      <label htmlFor="sort">Sort by: </label>
      <select
        id="sort"
        value={sortOption}
        onChange={(e) => setSortOption(e.target.value)}
      >
        <option value="newest">Newest First</option>
        <option value="oldest">Oldest First</option>
        <option value="authorAZ">Author A–Z</option>
        <option value="likes">Most Liked</option>
      </select>
    </div>
  )
}
