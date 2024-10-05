import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle2 } from 'lucide-react'

export default function ProgressDisplay({ isProcessing, generationProgress, onCancel }) {
  if (!isProcessing && (!generationProgress || generationProgress.length === 0)) {
    return null;
  }

  return (
    <Card className="w-full mt-6">
      <CardHeader>
        <CardTitle className="flex items-center">
          {isProcessing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
          )}
          Generation Progress
          
        {isProcessing && (
          <div className="mt-4 text-center">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onCancel();
              }}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Cancel Process
            </a>
          </div>
        )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {generationProgress.map((item, index) => (
            <div key={index} className="flex items-start">
              {item.status === 'processing' ? (
                <Loader2 className="w-4 h-4 mr-2 text-blue-500 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {item.status === 'processing' ? item.idea : item.title}
                </p>
                {item.status === 'completed' && (
                  <p className="text-xs text-gray-500">Completed</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}