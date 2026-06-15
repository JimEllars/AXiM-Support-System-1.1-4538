sed -i.bak -e '/avgConfidence: avgConfidence,/a\
            csatScore: (metrics.csatScore || 0),' src/components/analytics/SupportMetrics.jsx

sed -i.bak -e '/const yesterdayIso = yesterday.toISOString();/a\
\
        // CSAT Score\
        const { data: feedbackData, error: fbError } = await supabase\
          .from("product_feedback")\
          .select("rating")\
          .gte("created_at", yesterdayIso);\
\
        if (fbError) console.error("Feedback Error:", fbError);\
\
        let avgCsat = 0;\
        if (feedbackData && feedbackData.length > 0) {\
          const totalRating = feedbackData.reduce((sum, item) => sum + item.rating, 0);\
          avgCsat = (totalRating / feedbackData.length).toFixed(1);\
        }\
' src/components/analytics/SupportMetrics.jsx

sed -i.bak -e '/avgConfidence: avgConfidence,/c\
            avgConfidence: avgConfidence,\
            csatScore: avgCsat,' src/components/analytics/SupportMetrics.jsx

sed -i.bak -e '/activeQueue: 0,/a\
    csatScore: 0,' src/components/analytics/SupportMetrics.jsx

sed -i.bak -e '/grid-cols-1 md:grid-cols-4 gap-6/s/grid-cols-4/grid-cols-5/' src/components/analytics/SupportMetrics.jsx

sed -i.bak -e '/{metrics.slaBreachRate > 10 ? '\''border-l-rose-500\/50'\'' : '\''border-l-amber-500\/50'\''}\`}>/a\
      <div className={`glass-panel p-6 rounded-2xl border-l-2 relative overflow-hidden ${metrics.csatScore < 3.0 ? "border-l-amber-500/50" : "border-l-emerald-500/50"}`}>\
        {isLoading && <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center backdrop-blur-sm z-10"><div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}\
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Customer Satisfaction</p>\
        <h3 className={`text-3xl font-black mt-2 ${metrics.csatScore < 3.0 ? "text-amber-400" : "text-emerald-400"}`}>{metrics.csatScore} <span className="text-lg text-zinc-500">/ 5.0</span></h3>\
        <div className={`mt-2 text-[10px] font-medium tracking-widest ${metrics.csatScore < 3.0 ? "text-amber-500/80" : "text-emerald-500/80"}`}>AVG RATING 24H</div>\
      </div>' src/components/analytics/SupportMetrics.jsx
