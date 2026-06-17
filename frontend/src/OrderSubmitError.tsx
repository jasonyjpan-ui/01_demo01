import type { Order } from "../../shared/contracts";

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
  order: Order | null;
  onDismiss?: () => void;
  onRetryRefresh?: () => void;
}

export function OrderSubmitError({
  error,
  order,
  onDismiss,
  onRetryRefresh,
}: OrderSubmitErrorProps) {
  if (!error) {
    return null;
  }

  const isVersionMismatch = error.error?.includes("version mismatch");

  return (
    <div className="submit-error-modal">
      <div className="error-overlay" onClick={onDismiss} />
      <div className="error-dialog">
        <div className="error-header">
          <h3>⚠️ 訂單提交失敗</h3>
          <button className="close-btn" onClick={onDismiss}>×</button>
        </div>

        <div className="error-body">
          <p className="error-message">{error.error}</p>

          {error.details?.message && (
            <p className="error-detail-message">
              {error.details.message}
            </p>
          )}

          {error.details?.staleItems && error.details.staleItems.length > 0 && (
            <div className="stale-items-section">
              <h4>受影響的項目：</h4>
              <ul className="stale-items-details">
                {error.details.staleItems.map((item) => (
                  <li key={item.id} className="stale-item-detail">
                    <div className="item-header">
                      <span className="item-name">{item.name}</span>
                      <span className="item-reason">({item.reason})</span>
                    </div>
                    <div className="item-price">
                      {item.currentPrice !== undefined ? (
                        <>
                          <span className="old-price">¥{item.orderedPrice}</span>
                          <span className="price-arrow">→</span>
                          <span className="new-price">¥{item.currentPrice}</span>
                        </>
                      ) : (
                        <span className="unavailable">已移除</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isVersionMismatch && (
            <div className="version-mismatch-tips">
              <h4>建議：</h4>
              <ul>
                <li>✓ 重新刷新菜單以獲取最新價格</li>
                <li>✓ 確認您要購買的項目和數量</li>
                <li>✓ 移除已不可用的項目</li>
                <li>✓ 更新訂單並重新提交</li>
              </ul>
            </div>
          )}
        </div>

        <div className="error-footer">
          {onRetryRefresh && (
            <button
              className="btn btn-primary"
              onClick={onRetryRefresh}
            >
              🔄 刷新菜單重試
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={onDismiss}
          >
            關閉
          </button>
        </div>
      </div>

      <style>{`
        .submit-error-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .error-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          cursor: pointer;
        }

        .error-dialog {
          position: relative;
          background-color: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          z-index: 1001;
        }

        .error-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .error-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #999;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          color: #333;
        }

        .error-body {
          flex: 1;
          padding: 16px 20px;
          overflow-y: auto;
        }

        .error-message {
          margin: 0 0 12px 0;
          color: #f44336;
          font-weight: 500;
          font-size: 14px;
        }

        .error-detail-message {
          margin: 0 0 16px 0;
          color: #666;
          font-size: 13px;
          padding: 8px 12px;
          background-color: #fef5f5;
          border-left: 3px solid #ff9800;
          border-radius: 4px;
        }

        .stale-items-section {
          margin: 16px 0;
        }

        .stale-items-section h4 {
          margin: 0 0 8px 0;
          font-size: 13px;
          font-weight: 600;
          color: #333;
        }

        .stale-items-details {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .stale-item-detail {
          padding: 8px 12px;
          margin: 4px 0;
          background-color: #fef5f5;
          border-left: 3px solid #f44336;
          border-radius: 4px;
        }

        .item-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .item-name {
          font-weight: 500;
          color: #333;
          font-size: 13px;
        }

        .item-reason {
          font-size: 11px;
          color: #999;
        }

        .item-price {
          font-size: 12px;
          color: #d32f2f;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .old-price {
          text-decoration: line-through;
          opacity: 0.7;
        }

        .price-arrow {
          color: #999;
        }

        .new-price {
          font-weight: 600;
        }

        .unavailable {
          color: #999;
          font-style: italic;
        }

        .version-mismatch-tips {
          margin-top: 16px;
          padding: 12px;
          background-color: #e3f2fd;
          border-left: 3px solid #1976d2;
          border-radius: 4px;
        }

        .version-mismatch-tips h4 {
          margin: 0 0 8px 0;
          font-size: 13px;
          font-weight: 600;
          color: #1565c0;
        }

        .version-mismatch-tips ul {
          margin: 0;
          padding: 0 0 0 20px;
        }

        .version-mismatch-tips li {
          margin: 4px 0;
          font-size: 12px;
          color: #333;
        }

        .error-footer {
          display: flex;
          gap: 8px;
          padding: 16px 20px;
          border-top: 1px solid #e0e0e0;
          justify-content: flex-end;
        }

        .btn {
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-primary {
          background-color: #1976d2;
          color: white;
        }

        .btn-primary:hover {
          background-color: #1565c0;
        }

        .btn-secondary {
          background-color: #f5f5f5;
          color: #333;
          border: 1px solid #ddd;
        }

        .btn-secondary:hover {
          background-color: #eeeeee;
        }
      `}</style>
    </div>
  );
}
