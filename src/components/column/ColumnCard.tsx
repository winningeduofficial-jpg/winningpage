import { Eye } from "lucide-react";
import { Link } from "react-router";
import {
  ALL_CATEGORY,
  formatDate,
  getCategoryLabel,
  getDisplayDate,
  getThumbnailUrl,
  getViewCount,
} from "../../pages/column/columnData";

type ColumnLike = {
  id: string | number;
  title?: string;
  [key: string]: unknown;
};

function Thumbnail({
  url,
  title,
  className,
}: {
  url?: string | null;
  title?: string | undefined;
  className?: string;
}) {
  if (!url) {
    return <div className={`bg-[#D9D9D9] ${className}`} aria-hidden="true" />;
  }

  return (
    <img
      src={url}
      alt={title || ""}
      className={`object-cover transition duration-500 group-hover:scale-105 ${className}`}
    />
  );
}

function MetaRow({
  column,
  className = "",
}: {
  column: ColumnLike;
  className?: string;
}) {
  const viewCount = getViewCount(column);

  return (
    <div
      className={`flex items-center gap-4 text-sm font-normal leading-[1.3] tracking-[-0.02em] text-[#7A7A7A] ${className}`}
    >
      <span>{formatDate(getDisplayDate(column))}</span>
      {viewCount !== null && (
        <span className="inline-flex items-center gap-[0.3125rem]">
          <Eye size={16} className="shrink-0" />
          {viewCount}
        </span>
      )}
    </div>
  );
}

type ColumnCardProps = {
  column: ColumnLike;
  variant?: "grid" | "heroLarge" | "heroSmall";
};

export default function ColumnCard({
  column,
  variant = "grid",
}: ColumnCardProps) {
  const thumbnail = getThumbnailUrl(column);
  const categoryLabel = getCategoryLabel(column);
  const hasCategory = categoryLabel !== ALL_CATEGORY;

  if (variant === "heroLarge") {
    return (
      <Link to={`/info/column/${column.id}`} className="group block flex-1">
        <div className="relative w-full overflow-hidden rounded-[1.375rem]">
          <Thumbnail
            url={thumbnail}
            title={column.title}
            className="aspect-[10/7] h-auto w-full"
          />
          {hasCategory && (
            <span className="absolute right-6 top-[1.625rem] rounded-full bg-[#013262] px-4 py-2 text-base font-medium leading-[1.4] tracking-[-0.02em] text-white">
              {categoryLabel}
            </span>
          )}
        </div>

        <div className="mt-8 max-w-[32rem]">
          <h3 className="text-2xl sm:text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252]">
            {column.title}
          </h3>
          <MetaRow column={column} className="mt-2" />
        </div>
      </Link>
    );
  }

  if (variant === "heroSmall") {
    return (
      <Link
        to={`/info/column/${column.id}`}
        className="group flex items-start gap-4 sm:gap-5"
      >
        <Thumbnail
          url={thumbnail}
          title={column.title}
          className="aspect-[10/7] w-24 shrink-0 rounded-[0.5625rem] sm:w-[10.5rem]"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {hasCategory && (
            <span className="w-fit rounded-full border border-[#D7D7D7] bg-white px-3.5 py-1 text-sm font-medium leading-[1.4] tracking-[-0.02em] text-[#525252]">
              {categoryLabel}
            </span>
          )}
          <h3 className="line-clamp-2 break-keep text-xl font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252]">
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
        <h3 className="line-clamp-2 break-keep text-lg font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252]">
          {column.title}
        </h3>
        <MetaRow column={column} className="mt-2" />
      </div>
    </Link>
  );
}
