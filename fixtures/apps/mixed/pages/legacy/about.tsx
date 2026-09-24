import { legacyBlob } from '../../shared/legacy-data';

export default function LegacyAboutPage() {
  return <p>legacy bytes: {legacyBlob.join('').length}</p>;
}
