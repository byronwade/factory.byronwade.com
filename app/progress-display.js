import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Progress } from "@/components/ui/progress"

export default function ProgressDisplay({ isProcessing, generationProgress, onCancel, totalItems }) {
  if (!isProcessing && (!generationProgress || generationProgress.length === 0)) {
    return null;
  }

  const completedItems = generationProgress.filter(item => item.status === 'completed').length;
  const inProgressItems = generationProgress.filter(item => item.status === 'processing');
  const inProgressPercentage = inProgressItems.reduce((sum, item) => sum + (item.progress || 0), 0) / totalItems;
  const overallProgress = Math.min(((completedItems + inProgressPercentage) / totalItems) * 100, 100);

  return (
    <Card className="w-full mt-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            {isProcessing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
            )}
            Generation Progress
          </span>
          {isProcessing && (
            <button
              onClick={onCancel}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Cancel Process
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={overallProgress} className="mb-4" />
        <p className="mb-2 text-sm font-medium">
          {completedItems} of {totalItems} items completed ({overallProgress.toFixed(1)}%)
        </p>
        <div className="space-y-4">
          {generationProgress.filter(item => item.id).map((item, index) => (
            <div key={item.id} className="flex items-start">
              {item.status === 'processing' && (
                <Loader2 className="w-4 h-4 mr-2 text-blue-500 animate-spin" />
              )}
              {item.status === 'completed' && (
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
              )}
              {item.status === 'error' && (
                <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {item.id}
                </p>
                <Progress value={Math.min(item.progress, 100)} className="mt-1 mb-1" />
                <p className="text-xs text-gray-500">
                  {Math.min(item.progress, 100).toFixed(1)}% - {item.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
