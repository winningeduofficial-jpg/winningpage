import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import {
  ALL_CATEGORY,
  formatDate,
  getCategoryLabel,
  getDisplayDate,
  getThumbnailUrl,
  getViewCount
} from '../../pages/column/columnData';

function Thumbnail({ url, title, className }) {
  if (!url) {
    return <div className={`bg-[#D9D9D9] ${className}`} aria-hidden="true" />;
  }

  return (
    <img
      src={url}
      alt={title || ''}
      className={`object-cover transition duration-500 group-hover:scale-105 ${className}`}
    />
  );
}

function MetaRow({ column, className = '' }) {
  const viewCount = getViewCount(column);

  return (
    <div className={`flex items-center gap-5 text-base font-normal leading-[1.3] tracking-[-0.02em] text-[#7A7A7A] ${className}`}>
      <span>{formatDate(getDisplayDate(column))}</span>
      {viewCount !== null && (
        <span className="inline-flex items-center gap-[0.3125rem]">
          <Eye size={20} className="shrink-0" />
          {viewCount}
        </span>
      )}
    </div>
  );
}

export default function ColumnCard({ column, variant = 'grid' }) {
  const thumbnail = getThumbnailUrl(column);
  const categoryLabel = getCategoryLabel(column);
  const hasCategory = categoryLabel !== ALL_CATEGORY;

  if (variant === 'heroLarge') {
    return (
      <Link to={`/info/column/${column.id}`} className="group block flex-1">
        <div className="relative w-full overflow-hidden rounded-[1.375rem]">
          <Thumbnail
            url={thumbnail}
            title={column.title}
            className="aspect-[10/7] h-auto w-full"
          />
          {hasCategory && (
            <span className="absolute right-6 top-[1.625rem] rounded-full bg-[#013262] px-6 py-3 text-xl font-medium leading-[1.4] tracking-[-0.02em] text-white">
              {categoryLabel}
            </span>
          )}
        </div>

        <div className="mt-8 max-w-[24rem]">
          <h3 className="text-[2rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252]">
            {column.title}
          </h3>
          <MetaRow column={column} className="mt-2" />
        </div>
      </Link>
    );
  }

  if (variant === 'heroSmall') {
    return (
      <Link to={`/info/column/${column.id}`} className="group flex items-start gap-4 sm:gap-[1.625rem]">
        <Thumbnail
          url={thumbnail}
          title={column.title}
          className="aspect-[10/7] w-24 shrink-0 rounded-[0.5625rem] sm:w-[16.28rem]"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {hasCategory && (
            <span className="w-fit rounded-full border border-[#D7D7D7] bg-white px-6 py-1.5 text-sm font-medium leading-[1.4] tracking-[-0.02em] text-[#525252]">
              {categoryLabel}
            </span>
          )}
          <h3 className="line-clamp-2 text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252]">
            {column.title}
          </h3>
          <MetaRow column={column} />
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/info/column/${column.id}`} className="group block">
      <Thumbnail
        url={thumbnail}
        title={column.title}
        className="aspect-[10/7] w-full rounded-xl"
      />

      <div className="mt-5">
        <h3 className="truncate text-xl font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252]">
          {column.title}
        </h3>
        <MetaRow column={column} className="mt-2" />
      </div>
    </Link>
  );
}
