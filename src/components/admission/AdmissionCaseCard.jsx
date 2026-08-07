import { Link } from 'react-router-dom';
import { formatDate, getThumbnailUrl } from '../../pages/admission/admissionCaseData';

function Thumbnail({ url, title }) {
  if (!url) {
    return <div className="aspect-square w-full rounded-xl bg-[#D9D9D9]" aria-hidden="true" />;
  }

  return (
    <img
      src={url}
      alt={title || ''}
      className="aspect-square w-full rounded-xl object-cover transition duration-500 group-hover:scale-105"
    />
  );
}

export default function AdmissionCaseCard({ row }) {
  const thumbnail = getThumbnailUrl(row);

  return (
    <Link to={`/admission/${row.category}/${row.id}`} className="group block overflow-hidden">
      <Thumbnail url={thumbnail} title={row.title} />

      <h3 className="mt-5 line-clamp-2 break-keep text-lg font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252]">
        {row.title}
      </h3>
      <p className="mt-2 text-sm font-normal leading-[1.3] tracking-[-0.02em] text-[#7A7A7A]">
        {formatDate(row.created_at)}
      </p>
    </Link>
  );
}
