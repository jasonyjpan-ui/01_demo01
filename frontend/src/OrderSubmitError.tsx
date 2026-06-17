interface SubmitErrorDetails {
  error: string;
  details?: {
    staleItems?: Array<{
      id: number;
      name: string;
      orderedPrice: number;
      currentPrice?: number;
      reason: string;
    }>;
    message?: string;
  };
}

interface OrderSubmitErrorProps {
  error: SubmitErrorDetails | null;
  onDismiss?: () => void;
  onRetryRefresh?: () => void;
}

export function OrderSubmitError({
  error,
  onDismiss,
  onRetryRefresh,
}: OrderSubmitErrorProps) {
  if (!error) {
    return null;
  }

  const staleItems = error.details?.staleItems ?? [];
  const isVersionMismatch = error.error?.includes("version mismatch");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="關閉送單錯誤"
        onClick={onDismiss}
      />
      <section className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-base-100 shadow-2xl">
        <header className="flex items-center justify-between border-b border-base-300 px-5 py-4">
          <h3 className="text-base font-semibold">訂單送出失敗</h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDismiss}>
            關閉
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="alert alert-error mb-4">
            <span>{error.error}</span>
          </div>

          {error.details?.message ? (
            <p className="mb-4 rounded border-l-4 border-warning bg-warning/10 px-3 py-2 text-sm">
              {error.details.message}
            </p>
          ) : null}

          {staleItems.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">需要處理的品項</h4>
              <ul className="space-y-2">
                {staleItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded border border-error/30 bg-error/5 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs opacity-70">{item.reason}</span>
                    </div>
                    <div className="mt-1 text-sm">
                      {item.currentPrice !== undefined ? (
                        <>
                          <span className="line-through opacity-60">
                            ${item.orderedPrice}
                          </span>
                          <span className="mx-2">→</span>
                          <span className="font-bold text-error">
                            ${item.currentPrice}
                          </span>
                        </>
                      ) : (
                        <span className="opacity-70">目前沒有可用的新版本</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {isVersionMismatch ? (
            <div className="mt-4 rounded border-l-4 border-info bg-info/10 px-3 py-2 text-sm">
              請重新整理菜單與購物車，確認最新價格後再送出訂單。
            </div>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-base-300 px-5 py-4">
          {onRetryRefresh ? (
            <button type="button" className="btn btn-primary" onClick={onRetryRefresh}>
              重新整理
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onDismiss}>
            我知道了
          </button>
        </footer>
      </section>
    </div>
  );
}
