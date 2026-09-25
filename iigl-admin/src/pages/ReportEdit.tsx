import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress } from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { Notice, Panel } from '../components/ui';
import CertificateForm, {
  type CertificateDraft,
  type CertificatePayload,
  type OrderHead,
  type OrderItem,
} from '../components/CertificateForm';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';

/** One grading field as the certificate stored it. */
interface SavedAttribute {
  attr_id: string | number;
  attr_value: string | null;
  attr_desc: string | null;
  image: string | null;
  /** The value's name, resolved by the API. */
  value: string | null;
}

interface Report {
  id: number;
  report_no: string;
  /** The order's id, despite the name — Laravel's column. */
  order_no: string | number | null;
  order_detail_id: string | number | null;
  subcategory_id: string | number | null;
  gross_weight: string | null;
  gross_wt_unit: number | null;
  carat_weight: string | null;
  stone_wt_unit: number | null;
  size: string | null;
  comments: string | null;
  is_approx: number | null;
  item_image: string | null;
  attributes: SavedAttribute[];
}

/** The certificate as the form holds it. */
function draftOf(r: Report): CertificateDraft {
  const saved = r.attributes ?? [];
  const byId = <T,>(pick: (a: SavedAttribute) => T) =>
    Object.fromEntries(saved.map((a) => [Number(a.attr_id), pick(a)]));
  return {
    subcategory_id: r.subcategory_id == null ? '' : String(r.subcategory_id),
    gross_weight: r.gross_weight ?? '',
    gross_wt_unit: r.gross_wt_unit == null ? '' : String(r.gross_wt_unit),
    carat_weight: r.carat_weight ?? '',
    stone_wt_unit: r.stone_wt_unit == null ? '' : String(r.stone_wt_unit),
    size: r.size ?? '',
    comments: r.comments ?? '',
    is_approx: Boolean(r.is_approx),
    item_image: r.item_image || null,
    values: byId((a) => a.attr_value ?? ''),
    notes: byId((a) => a.attr_desc ?? ''),
    // Kept, so saving an amendment does not drop the pictures it was issued with.
    images: byId((a) => a.image ?? null),
    labels: byId((a) => a.value ?? ''),
  };
}

/**
 * Amending an issued certificate.
 *
 * The same form it was issued on, less the two things that cannot move: the
 * order item it belongs to, and the number. The number is printed on a
 * document already in a customer's hands, and the API never reallocates it.
 *
 * The screen exists for the weight above all. An order is priced per
 * certificate and the band comes from the carat weight, so a stone recorded at
 * a weight no band covers is billed as zero and reads "unpriced" on the order,
 * with nowhere to go and correct it. This is that somewhere.
 */
export default function ReportEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const source = useFetch<{ data: Report }>(`/reports/${id}`);
  const r = source.data?.data;

  /*
    The order, for the invoice head and for which fields the cards carry. It
    can be refused — head office does not open lab orders — and the form then
    goes without the head rather than without the form.
  */
  const order = useFetch<{ data: OrderHead & { items: OrderItem[] } }>(
    r?.order_no ? `/orders/${r.order_no}` : null,
  );
  const item = order.data?.data.items.find((i) => Number(i.id) === Number(r?.order_detail_id));

  const save = async (payload: CertificatePayload) => {
    await api.patch(`/reports/${id}`, payload);
    toast.ok(`Certificate ${r?.report_no ?? ''} amended.`);
    navigate(-1);
  };

  const back = (
    <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
      Back
    </Button>
  );

  if (source.error) return <Notice kind="error">{source.error}</Notice>;
  if (source.loading || !r || (r.order_no && order.loading)) {
    return (
      <Panel title="Edit certificate" actions={back}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={26} />
        </Box>
      </Panel>
    );
  }

  return (
    <CertificateForm
      key={r.id}
      title={`Edit — ${r.report_no}`}
      actions={back}
      head={order.data?.data ?? null}
      item={item}
      itemNote={
        <>
          Certificate <span className="mono">{r.report_no}</span>
          {item ? ` · item #${item.id}` : ''}
        </>
      }
      initial={draftOf(r)}
      submitLabel="Save changes"
      busyLabel="Saving…"
      footnote="The certificate number and the item it belongs to do not change."
      onCancel={() => navigate(-1)}
      onSubmit={save}
    />
  );
}
