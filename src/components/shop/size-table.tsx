import { SIZE_ROWS } from "@/lib/sizes";

function formatMeasure([base, alternate]: readonly [number, number]) {
  return base === alternate ? base : `${base} (${alternate})`;
}

export function SizeTable() {
  return (
    <table className="w-full border-collapse text-left text-xs sm:text-sm">
      <caption className="mb-2 text-left font-medium">Таблица мерок построения</caption>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className="py-2 pr-2">Размер</th>
          <th scope="col" className="py-2 pr-2">Грудь, см</th>
          <th scope="col" className="py-2 pr-2">Талия, см</th>
          <th scope="col" className="py-2">Бёдра, см</th>
        </tr>
      </thead>
      <tbody>
        {SIZE_ROWS.map(row => (
          <tr className="border-b border-line" key={row.size}>
            <th scope="row" className="whitespace-nowrap py-2 pr-2 font-medium">{row.ru} / {row.size}</th>
            <td className="py-2 pr-2">{formatMeasure(row.bust)}</td>
            <td className="whitespace-nowrap py-2 pr-2">{formatMeasure(row.waist)}</td>
            <td className="whitespace-nowrap py-2">{formatMeasure(row.hips)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
